FROM node:20-slim

# Install exiftool
RUN apt-get update && apt-get install -y exiftool && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json .
RUN npm install
COPY server.js .

EXPOSE 3000
CMD ["node", "server.js"]
