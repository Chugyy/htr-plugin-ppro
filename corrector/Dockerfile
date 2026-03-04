FROM python:3-alpine

COPY grammalecte/ /srv/grammalecte/
COPY grammalecte-server.py /srv/

ENV PYTHONUNBUFFERED=TRUE

EXPOSE 8080

WORKDIR /srv

ENTRYPOINT ["python3"]

CMD ["grammalecte-server.py","-ht", "0.0.0.0","-p","8080","-t"]

# Create the container with
# `docker build -t grammalecte:latest .`

# Lauch the container with:
# `docker run --rm -p 8080:8080 --name gr grammalecte:latest`
