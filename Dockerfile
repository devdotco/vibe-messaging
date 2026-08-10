FROM node:20-alpine AS builder
WORKDIR /app

ARG NEXT_PUBLIC_APP_URL=https://chat.vb.co
ARG NEXT_PUBLIC_AUTH_URL=https://finance.vb.co
ARG NEXT_PUBLIC_PUSHER_KEY=6ccc57c411b197af0f6a
ARG NEXT_PUBLIC_PUSHER_CLUSTER=us2
ARG NEXT_PUBLIC_CRM_URL=https://crm.vb.co

ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL
ENV NEXT_PUBLIC_PUSHER_KEY=$NEXT_PUBLIC_PUSHER_KEY
ENV NEXT_PUBLIC_PUSHER_CLUSTER=$NEXT_PUBLIC_PUSHER_CLUSTER
ENV NEXT_PUBLIC_CRM_URL=$NEXT_PUBLIC_CRM_URL

COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache postgresql-client

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/db/migrations ./db/migrations

COPY start.sh ./start.sh
RUN chmod +x start.sh

EXPOSE 3000
CMD ["./start.sh"]
