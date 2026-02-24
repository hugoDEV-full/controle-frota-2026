FROM node:23.11
VOLUME /stats
RUN mkdir -p /stats && chown -R node:node /stats
ARG TZ
ENV TZ=$TZ
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone
USER root
WORKDIR /src
CMD sh -c "npm run live"

