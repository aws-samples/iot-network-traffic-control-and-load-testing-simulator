# NORMAL mode
# Dockerfile for both locust master and worker
FROM --platform=linux/amd64 locustio/locust:2.13.0
COPY ../.. ./

# Install Dependencies
RUN pip install -r requirements.txt

# for standalone
ENTRYPOINT ["locust", "-f", "./locustfile_paho.py"]

# Below CMD will be run in ContainerService initialization
# ------------------
# for worker
# CMD [ "--worker", "--master-host", "MASTER_HOST_NAME"]
# for master
# CMD ["--master"]
