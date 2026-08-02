FROM node:18-alpine

WORKDIR /app

# Install ffmpeg for media conversion
RUN apk add --no-cache ffmpeg

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 8000

CMD ["node", "server.js"]
