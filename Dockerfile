FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=10000
WORKDIR /app
# The package includes an already-built browser app. No install or build is needed to run.
COPY --chown=node:node . /app
USER node
EXPOSE 10000
CMD ["node", "server.mjs"]
