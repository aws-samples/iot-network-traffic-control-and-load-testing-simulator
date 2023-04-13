#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { IoTFaultInjectionSimulatorStack } from './cdk/iotFaultInjectionStack';
import { IoTLoadTestingSimulatorStack } from './cdk/iotLoadTestStack';

const app = new cdk.App();
new IoTFaultInjectionSimulatorStack(app, 'IoTFaultInjectionSimulatorStack', {
  env: {
    // AWS region to deploy this stack to. (Required for defining ALB access logging)
    region: 'ap-northeast-2',
  },

  // MQTT Setting
  mqttWaitTime: 1, // Frequency of publishing MQTT message to IoT Core
  mqttQos: 0, // QoS strategy of MQTT
  mqttMessage: 'Test Message payload', // Message payload to publish to IoT Core

  // IoT Core Endpoint
  iotCoreEndpoint: 'azogl4y0hhyqi-ats.iot.ap-northeast-2.amazonaws.com',
  // IoT Core Topic to publish to
  iotCoreMqttTopic: 'iot-simulator-fault-injector-topic',
  // IoT Core ThingName to use
  iotThingName: 'iot-simulator-fault-injector-thing',

  // Specify type of EC2 Instance to use for worker task.
  ec2InstanceType: 'm4.4xlarge',

  // CIDRs that can access Locust Web UI ALB.
  // It is highly recommended to set this CIDR as narrowly as possible
  // since Locust Web UI does NOT have any authentication mechanism
  allowedCidrs: ['0.0.0.0/0'],
});

new IoTLoadTestingSimulatorStack(app, 'IoTLoadTestingSimulatorStack', {
  env: {
    // AWS region to deploy this stack to. (Required for defining ALB access logging)
    region: 'ap-northeast-2',
  },

  // MQTT Setting
  mqttWaitTime: 1, // Frequency of publishing MQTT message to IoT Core
  mqttQos: 0, // QoS strategy of MQTT
  mqttMessage: 'Test Message payload', // Message payload to publish to IoT Core

  // Specify number of Worker Tasks
  // Please also be aware that your default quota for the number of Fargate tasks is 1000.
  // If you need more tasks, you can request a limit increase from Service Quotas console.
  workerDesiredCount: 100,

  // IoT Core Endpoint
  iotCoreEndpoint: 'azogl4y0hhyqi-ats.iot.ap-northeast-2.amazonaws.com',
  // IoT Core Topic to publish to
  iotCoreMqttTopic: 'iot-simulator-load-testing-topic',
  // IoT Core ThingName to use
  iotThingName: 'iot-simulator-load-testing-thing',

  // CIDRs that can access Locust Web UI ALB.
  // It is highly recommended to set this CIDR as narrowly as possible
  // since Locust Web UI does NOT have any authentication mechanism
  allowedCidrs: ['0.0.0.0/0'],
});
