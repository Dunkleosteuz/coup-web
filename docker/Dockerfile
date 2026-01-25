FROM python:3.8

WORKDIR /app

COPY requirements.txt .

RUN pip install --upgrade pip
RUN apt-get update && apt-get install -y build-essential
RUN pip install git+https://github.com/aaugustin/websockets.git@11.0.3
RUN pip install -r requirements.txt

COPY . .

EXPOSE 3000
COPY docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]
