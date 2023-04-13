# TRAFFIC_CONTROL Mode
# Dockerfile for locust worker of which network
# can be controlled by docker-tc.
FROM --platform=linux/amd64 locustio/locust:2.13.0

COPY . /app/
WORKDIR /app

# Build python dependencies (incl. locust)
RUN pip install -r requirements.txt

# for standalone
#ENTRYPOINT ["locust", "-f", "./locustfile_paho.py"]
#CMD [ "--worker", "--master-host", "$LOCUST_MASTER_HOST_NAME"]
