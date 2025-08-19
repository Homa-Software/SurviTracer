# Build stage
FROM node:24-bookworm AS builder

# Enable Corepack for Yarn
RUN corepack enable
ENV DEBIAN_FRONTEND=noninteractive
RUN apt update && apt install -y zlib1g-dev python3 make build-essential

# Set working direcory
WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
RUN corepack install


CMD [ "sh" ]

RUN yarn install

COPY . .

RUN yarn build

# Runtime stage
FROM node:24-bookworm AS runtime

RUN corepack enable

WORKDIR /app

COPY package.json  ./


COPY --from=builder /app/dist ./dist

RUN useradd -ms /bin/bash nodejs
RUN chown -R nodejs:nodejs /app
RUN mkdir -p /var/data
RUN chown -R nodejs:nodejs /var/data

USER nodejs


# Start the applicaion
CMD ["node", "dist/main.js"]