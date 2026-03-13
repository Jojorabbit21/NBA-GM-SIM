# Supabase 모니터링 가이드

## 개요
서비스 과부하 감지를 위한 Supabase 모니터링 구성.
두 가지 도구를 사용하며, 각각 SQL 엔진이 다름.

| 도구 | 경로 | SQL 엔진 | 용도 |
|------|------|----------|------|
| **Custom Report** | Reports → Custom Report | Postgres SQL | DB 내부 통계 |
| **Log Explorer** | Logs → Log Explorer | BigQuery 스타일 | API 트래픽/응답시간 |

---

## Part A: Custom Report (Postgres SQL)

**경로**: Reports → Custom Report

페이지를 열면 모든 Snippet이 최신 데이터로 자동 렌더링됨.

### A1: 활성 커넥션
서버 다운 직결. Pro 제한 200개.
```sql
select
  state,
  count(*) as connections,
  max(extract(epoch from now() - state_change))::int as max_duration_sec
from pg_stat_activity
where pid != pg_backend_pid()
group by state
order by connections desc
```

### A2: DB 전체 캐시 히트율
99% 이하 시 성능 저하 신호.
```sql
select
  sum(heap_blks_hit) as total_hit,
  sum(heap_blks_read) as total_read,
  round(100.0 * sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) as cache_hit_pct
from pg_statio_user_tables
```

### A3: 인덱스 사용률 (풀스캔 감지)
idx_usage_pct가 낮은 테이블 = 풀스캔 발생 중.
```sql
select
  relname as table_name,
  seq_scan,
  idx_scan,
  case when seq_scan + idx_scan > 0
    then round(100.0 * idx_scan / (seq_scan + idx_scan), 2)
    else 0
  end as idx_usage_pct,
  n_live_tup as live_rows
from pg_stat_user_tables
where n_live_tup > 0
order by idx_usage_pct asc
limit 20
```

### A4: 테이블별 I/O 통계
어떤 테이블이 가장 바쁜지 확인.
```sql
select
  relname as table_name,
  seq_scan,
  idx_scan,
  n_tup_ins as inserts,
  n_tup_upd as updates,
  n_tup_del as deletes,
  n_live_tup as live_rows
from pg_stat_user_tables
order by seq_scan desc
limit 20
```

### A5: 테이블별 캐시 히트율
테이블 단위 상세 캐시 현황.
```sql
select
  relname as table_name,
  heap_blks_hit,
  heap_blks_read,
  case when heap_blks_hit + heap_blks_read > 0
    then round(100.0 * heap_blks_hit / (heap_blks_hit + heap_blks_read), 2)
    else 0
  end as cache_hit_pct
from pg_statio_user_tables
order by heap_blks_read desc
limit 20
```

### A6: 테이블 사이즈
디스크 증가 추이 확인.
```sql
select
  relname as table_name,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size,
  pg_total_relation_size(relid) as size_bytes,
  n_live_tup as live_rows
from pg_stat_user_tables
order by pg_total_relation_size(relid) desc
limit 20
```

### A7: Dead Tuple 모니터링
대량 삭제 후 autovacuum이 정리하고 있는지 확인.
```sql
select
  relname as table_name,
  n_dead_tup,
  n_live_tup,
  last_autovacuum,
  last_autoanalyze
from pg_stat_user_tables
where n_dead_tup > 0
order by n_dead_tup desc
limit 10
```

---

## Part B: Log Explorer (로그 전용 SQL)

**경로**: Logs → Log Explorer

자동 실행되지 않음. 매번 수동으로 Run 필요.

### B1: 시간대별 API 요청량
```sql
select
  cast(timestamp as datetime) as t,
  count(*) as request_count
from edge_logs
group by t
order by t desc
limit 24
```

### B2: 시간대별 에러 (4xx/5xx)
```sql
select
  cast(timestamp as datetime) as timestamp,
  event_message,
  r.status_code
from edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.response) as r
where
  r.status_code >= 400
order by
  timestamp desc
limit 100
```

### B3: 느린 응답 Top (1000ms 이상)
```sql
select
  cast(timestamp as datetime) as timestamp,
  event_message,
  r.origin_time
from edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.response) as r
where
  r.origin_time > 1000
order by
  r.origin_time desc
limit 100
```

### B4: 테이블별 요청량 + 응답시간 (병목 감지)
가장 중요한 쿼리. 어떤 테이블이 가장 많이 호출되고 느린지 한눈에 파악.
```sql
select
  regexp_extract(req.path, r'/rest/v1/([^?]+)') as table_name,
  req.method,
  count(*) as request_count,
  avg(res.origin_time) as avg_latency_ms,
  max(res.origin_time) as max_latency_ms
from edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.request) as req
  cross join unnest(m.response) as res
where
  req.path like '%rest/v1%'
group by table_name, req.method
order by request_count desc
```

### B5: Auth 로그 모니터링
```sql
select
  cast(timestamp as datetime) as timestamp,
  event_message
from auth_logs
order by
  timestamp desc
limit 100
```

### B6: DB 느린 쿼리 (Postgres 레벨)
```sql
select
  cast(timestamp as datetime) as timestamp,
  event_message
from postgres_logs
where
  event_message like '%duration%'
order by
  timestamp desc
limit 100
```

---

## Part C: 프리셋 리포트

Reports 좌측 메뉴에서 확인 (별도 설정 불필요):

| 메뉴 | 확인 항목 |
|------|-----------|
| Database | Connections, Cache hit rate, Query execution time, Database size |
| Infrastructure | CPU usage, Memory usage, Disk I/O |

---

## 사용 가능한 로그 소스 (참고)

| 소스 | 용도 |
|------|------|
| `edge_logs` | 모든 API 요청 (핵심) |
| `auth_logs` | Auth 서비스 에러/성능 |
| `auth_audit_logs` | 회원가입/로그인 감사 로그 |
| `postgres_logs` | DB 직접 로그 |
| `postgrest_logs` | REST API 서버 로그 |
| `supavisor_logs` | 커넥션 풀러 로그 |
| `realtime_logs` | Realtime 서버 로그 |

---

## 주요 감시 대상 테이블

| 테이블 | 위험도 | 이유 |
|--------|--------|------|
| `user_game_results` | **높음** | 로그인 시 전체 박스스코어 조회, 대량 쓰기/삭제 반복, 168MB |
| `saves` | **높음** | POST avg 853ms, 시뮬레이션 후 매번 write |
| `user_playoffs_results` | 중간 | 플레이오프 시즌 집중 부하 |
| `meta_players` | 낮음 | 읽기전용, 캐싱 가능 |
| `meta_schedule` | 낮음 | 읽기전용, 풀스캔 발생 중 (인덱스 추가 검토) |

---

## 운영 체크리스트

### 매일
- Custom Report 페이지 열어서 A1(커넥션), A2(캐시 히트율) 확인

### 주 1회
- Log Explorer에서 B4(테이블별 병목) 실행
- Custom Report A7(dead tuple) 확인

### 이상 징후 시
- B3(느린 응답) + B2(에러) 실행하여 원인 파악
- A3(인덱스 사용률)에서 풀스캔 테이블 확인

---

## 2025-03 베이스라인 (현재 상태)

참고용 초기 측정값:

| 항목 | 수치 |
|------|------|
| DB 전체 캐시 히트율 | 99.94% |
| 활성 커넥션 | 15 / 200 |
| `user_game_results` 사이즈 | 168MB |
| `saves` POST avg latency | 853ms |
| `user_game_results` POST avg latency | 681ms |
| `user_game_results` DELETE avg latency | 4,049ms |
