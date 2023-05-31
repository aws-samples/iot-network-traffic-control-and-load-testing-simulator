import json
import logging
import os
# import pathlib
import ssl
import time

import boto3
import paho.mqtt.client as paho
from locust import events
from locust import task, User
from locust.env import Environment
from locust.user.wait_time import constant

# dir_path = os.path.dirname(os.path.realpath(__file__))
# logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


# Refactored original source - https://github.com/mariocannistra/python-paho-mqtt-for-aws-iot

class MqttClient:
    def __init__(self, host: str, port: int,
                 ca_file: str, cert_file: str, priv_file: str,
                 listener: bool,
                 topic: str):
        self.connect = False
        self.host = host
        self.port = port
        self.ca_file = ca_file
        self.cert_file = cert_file
        self.priv_file = priv_file
        self.listener = listener
        self.topic = topic
        self.logger = logging.getLogger(repr(self))
        self.pub_ts = None

    def __on_connect(self, client, userdata, flags, rc):
        self.connect = True

        if self.listener:
            self.mqttc.subscribe(self.topic)

        self.logger.debug("{0}".format(rc))

    def __on_message(self, client, userdata, msg):
        latency = int((time.time() - float(json.loads(msg.payload)["timestamp"])) * 1000)
        events.request_success.fire(
            request_type="task",
            name="publish-task",
            response_time=latency,
            response_length=0,
        )
        self.logger.info("{0}, {1} - {2} | Latency: {3}".format(userdata, msg.topic, msg.payload, latency))

    def __on_log(self, client, userdata, level, buf):
        self.logger.debug("{0}, {1}, {2}, {3}".format(client, userdata, level, buf))

    def bootstrap_mqtt(self):
        self.mqttc = paho.Client()
        self.mqttc.on_connect = self.__on_connect
        self.mqttc.on_message = self.__on_message
        self.mqttc.on_log = self.__on_log

        self.mqttc.tls_set(self.ca_file,
                           certfile=self.cert_file,
                           keyfile=self.priv_file,
                           cert_reqs=ssl.CERT_REQUIRED,
                           tls_version=ssl.PROTOCOL_TLS_CLIENT,
                           ciphers=None)

        result_of_connection = self.mqttc.connect(self.host, self.port, keepalive=120)

        if result_of_connection == 0:
            self.connect = True

        return self

    def start(self):
        self.mqttc.loop_start()


class MqttUser(User):
    host = os.environ.get("IOT_CORE_ENDPOINT", None)
    topic = os.environ.get("IOT_CORE_MQTT_TOPIC", None)
    mqtt_wait_time = float(os.environ.get("MQTT_WAIT_TIME", 1))
    mqtt_qos = int(os.environ.get("MQTT_QOS", 1))
    mqtt_message = str(os.environ.get("MQTT_MESSAGE", "Test Message"))
    is_load_test = os.environ.get("IS_LOAD_TEST", None)
    port = 8883

    param_store_cert_path = os.environ.get("PARAM_STORE_CERT_PATH", None)
    param_store_priv_path = os.environ.get("PARAM_STORE_PRIV_PATH", None)

    ca_file = "certificate/AmazonRootCA1.pem"
    priv_file = "certificate/private.pem.key"
    cert_file = "certificate/certificate.pem.crt"

    wait_time = constant(mqtt_wait_time)

    def __init__(self, environment: Environment):
        super().__init__(environment)

        if self.is_load_test:
            # Get certificates from AWS IoT Core
            ssm = boto3.client('ssm')
            cert_string = ssm.get_parameter(Name=self.param_store_cert_path, WithDecryption=False)['Parameter']['Value']
            priv_string = ssm.get_parameter(Name=self.param_store_priv_path, WithDecryption=False)['Parameter']['Value']
            with open(self.cert_file, 'w+') as f:
                f.write(cert_string)
            with open(self.priv_file, 'w+') as f:
                f.write(priv_string)

        if not self.host or not self.topic:
            raise RuntimeError("Please set IoT Core Endpoint or Topic")

        if not self.param_store_cert_path or not self.param_store_priv_path:
            raise RuntimeError("Please set PARAM_STORE_CERT_PATH or PARAM_STORE_PRIV_PATH")

        # Connect
        self.client = MqttClient(host=self.host, port=self.port, ca_file=self.ca_file, cert_file=self.cert_file,
                                 priv_file=self.priv_file, listener=True, topic=self.topic).bootstrap_mqtt()
        self.client.start()

    @task
    def publish(self):
        if self.client.connect:
            msg = json.dumps({"message": self.mqtt_message, "timestamp": time.time()})
            self.client.mqttc.publish(topic=self.topic, payload=msg, qos=self.mqtt_qos)
            self.client.logger.info(f"Message published: {msg}")
        else:
            self.client.logger.info("Attempting to connect.")
