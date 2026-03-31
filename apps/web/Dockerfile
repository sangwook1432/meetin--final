FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# 빌드 시점 환경변수 (ARG → ENV로 전달)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_IMP_CODE
ARG NEXT_PUBLIC_IMP_PAY_CHANNEL_KEY
ARG NEXT_PUBLIC_IMP_CERT_CHANNEL_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_IMP_CODE=$NEXT_PUBLIC_IMP_CODE
ENV NEXT_PUBLIC_IMP_PAY_CHANNEL_KEY=$NEXT_PUBLIC_IMP_PAY_CHANNEL_KEY
ENV NEXT_PUBLIC_IMP_CERT_CHANNEL_KEY=$NEXT_PUBLIC_IMP_CERT_CHANNEL_KEY

RUN npm run build

# ── 런타임 이미지 ───────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# standalone 빌드 결과물만 복사
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
