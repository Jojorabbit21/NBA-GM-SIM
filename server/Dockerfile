FROM oven/bun:1

WORKDIR /app

COPY package.json .
RUN bun install --frozen-lockfile || bun install

COPY src/ src/

EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]
