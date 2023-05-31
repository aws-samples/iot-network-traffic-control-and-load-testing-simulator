# TRAFFIC_CONTROL Mode
# Dockerfile for launching docker-tc and locust-tc containers
FROM --platform=linux/amd64 ubuntu:latest

COPY . /app/
WORKDIR /app

# Install python3
RUN apt update
RUN apt -y install software-properties-common
RUN add-apt-repository ppa:deadsnakes/ppa -y
RUN apt -y install python3.10
RUN apt -y install python3-setuptools
RUN apt -y install python3-pip

# Install docker
RUN apt -y install docker
RUN apt -y install docker-compose
RUN chmod -R 755 /certificates

# Clone docker-tc
RUN mkdir /app/docker-tc
RUN git clone https://github.com/lukaszlach/docker-tc.git /app/docker-tc

# Install dependencies
RUN pip install -r requirements.txt
