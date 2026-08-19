FROM node:22-alpine3.21
ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY ["package.json", "pnpm-lock.yaml", "./"]
RUN pnpm install --production --silent && mv node_modules ../
COPY . .
EXPOSE 5432
RUN chown -R node /usr/src/app
USER node
CMD ["node", "electron.js"]
