FROM node:22-alpine

WORKDIR /app

# Install dependencies needed for node-gyp or postgres tools if needed
RUN apk add --no-cache netcat-openbsd

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 5000

CMD ["sh", "-c", "npx node-pg-migrate up && npm run dev"]
