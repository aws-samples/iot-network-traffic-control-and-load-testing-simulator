import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { NetworkMode } from 'aws-cdk-lib/aws-ecs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface LocustTrafficControlWorkerServiceProps {
  readonly image: ecs.ContainerImage;
  readonly cluster: ecs.ICluster;
  readonly awsDefaultRegion?: string;
  readonly mqttWaitTime: number;
  readonly mqttQos: number;
  readonly mqttMessage: string;
  readonly iotCoreEndpoint: string;
  readonly iotCoreMqttTopic: string;
  readonly paramStoreCertPath: string;
  readonly paramStorePrivPath: string;
}

export class LocustTrafficControlWorkerService extends Construct {
  public readonly service: ecs.Ec2Service;

  constructor(scope: Construct, id: string, props: LocustTrafficControlWorkerServiceProps) {
    super(scope, id);

    const { cluster, image } = props;

    const workerTaskRole = new iam.Role(this, 'WorkerTaskRole-', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    workerTaskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMFullAccess'));

    const DOCKER_SOCKET_VOLUME = 'docker-socket-volume';
    const DOCKER_TC_VOLUME = 'docker-tc-volume';
    const LOCUST_MNT_VOLUME = 'locust-mount-volume';
    const locustTcWorkerTaskDefinition = new ecs.Ec2TaskDefinition(this, 'TaskDefinition', {
      networkMode: NetworkMode.HOST,
      volumes: [
        {
          name: DOCKER_SOCKET_VOLUME,
          host: {
            sourcePath: '/var/run/docker.sock',
          },
        },
        {
          name: DOCKER_TC_VOLUME,
          host: {
            sourcePath: '/var/docker-tc',
          },
        },
        {
          name: LOCUST_MNT_VOLUME,
          host: {
            sourcePath: '/mnt/locust',
          },
        },
      ],
      taskRole: workerTaskRole,
    });

    const locustTcWorkerContainer = locustTcWorkerTaskDefinition.addContainer('locust-worker', {
      image,
      command: [
        '/bin/sh',
        '-c',
        // We should copy the compose file first since docker-in-docker with host mode
        // does not mount volume of the first container, but instead host filesystem.
        // Refer https://stackoverflow.com/questions/31381322/docker-in-docker-cannot-mount-volume for more info.
        'python3 get_certificate.py && ' + 'cp -R . /mnt/locust && ' + 'docker-compose -f worker.compose.yaml up',
      ],
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'locust-worker',
        logRetention: RetentionDays.ONE_WEEK,
      }),
      memoryReservationMiB: 1250,
      memoryLimitMiB: 2500,
      environment: {
        AWS_DEFAULT_REGION: props.awsDefaultRegion || 'ap-northeast-2',
        MQTT_WAIT_TIME: props.mqttWaitTime.toString(),
        MQTT_QOS: props.mqttQos.toString(),
        MQTT_MESSAGE: props.mqttMessage,
        IOT_CORE_ENDPOINT: props.iotCoreEndpoint,
        IOT_CORE_MQTT_TOPIC: props.iotCoreMqttTopic,
        PARAM_STORE_CERT_PATH: props.paramStoreCertPath,
        PARAM_STORE_PRIV_PATH: props.paramStorePrivPath,
      },
    });

    locustTcWorkerContainer.addUlimits({
      name: ecs.UlimitName.NOFILE,
      // Set as Locust recommendation https://github.com/locustio/locust/pull/1375
      hardLimit: 10000,
      softLimit: 10000,
    });

    locustTcWorkerContainer.addMountPoints(
      {
        sourceVolume: DOCKER_SOCKET_VOLUME,
        containerPath: '/var/run/docker.sock',
        readOnly: false,
      },
      {
        sourceVolume: LOCUST_MNT_VOLUME,
        containerPath: '/mnt/locust',
        readOnly: false,
      },
    );

    const dockerTcContainer = locustTcWorkerTaskDefinition.addContainer('docker-tc', {
      image,
      command: ['/bin/sh', '-c', 'cd docker-tc && HTTP_BIND=0.0.0.0 docker-compose up'],
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'locust-tc-worker',
        logRetention: RetentionDays.ONE_WEEK,
      }),
      memoryReservationMiB: 1250,
      memoryLimitMiB: 2500,
    });

    dockerTcContainer.addUlimits({
      name: ecs.UlimitName.NOFILE,
      // Set as Locust recommendation https://github.com/locustio/locust/pull/1375
      hardLimit: 10000,
      softLimit: 10000,
    });

    dockerTcContainer.addMountPoints(
      {
        sourceVolume: DOCKER_SOCKET_VOLUME,
        containerPath: '/var/run/docker.sock',
        readOnly: false,
      },
      {
        sourceVolume: DOCKER_TC_VOLUME,
        containerPath: '/var/docker-tc',
        readOnly: false,
      },
    );

    dockerTcContainer.addPortMappings({
      hostPort: 4080,
      containerPort: 4080,
    });

    this.service = new ecs.Ec2Service(this, 'Service', {
      cluster,
      taskDefinition: locustTcWorkerTaskDefinition,
      // We fix it by one since no more than one container can be launched in one EC2 instance
      // Also, since this solution only focuses on network fault injection, not load testing,
      // one worker will be sufficient
      desiredCount: 1,
      minHealthyPercent: 0,
    });
  }
}

export interface LocustLoadTestingWorkerServiceProps {
  readonly image: ecs.ContainerImage;
  readonly cluster: ecs.ICluster;
  readonly iotCoreEndpoint: string;
  readonly iotCoreMqttTopic: string;
  readonly paramStoreCertPath: string;
  readonly paramStorePrivPath: string;
  readonly desiredCount: number;
  readonly awsDefaultRegion?: string;
  readonly mqttWaitTime: number;
  readonly mqttQos: number;
  readonly mqttMessage: string;
}

export class LocustLoadTestingWorkerService extends Construct {
  public readonly service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: LocustLoadTestingWorkerServiceProps) {
    super(scope, id);

    const { cluster, image } = props;

    const workerTaskRole = new iam.Role(this, 'WorkerTaskRole-', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    workerTaskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMReadOnlyAccess'));

    const workerTaskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      // a locust worker can use only 1 core: https://github.com/locustio/locust/issues/1493
      cpu: 1024,
      memoryLimitMiB: 2048,
      taskRole: workerTaskRole,
    });

    workerTaskDefinition
      .addContainer('locust-worker', {
        image,
        command: ['--worker', '--master-host', 'master.iot-simulator'],
        logging: ecs.LogDriver.awsLogs({
          streamPrefix: 'locust-worker',
          logRetention: RetentionDays.SIX_MONTHS,
        }),
        environment: {
          AWS_DEFAULT_REGION: props.awsDefaultRegion || 'ap-northeast-2',
          MQTT_WAIT_TIME: props.mqttWaitTime.toString(),
          MQTT_QOS: props.mqttQos.toString(),
          MQTT_MESSAGE: props.mqttMessage,
          IOT_CORE_ENDPOINT: props.iotCoreEndpoint,
          IOT_CORE_MQTT_TOPIC: props.iotCoreMqttTopic,
          PARAM_STORE_CERT_PATH: props.paramStoreCertPath,
          PARAM_STORE_PRIV_PATH: props.paramStorePrivPath,
          IS_LOAD_TEST: 'true',
        },
      })
      .addUlimits({
        name: ecs.UlimitName.NOFILE,
        // Set as Locust recommendation https://github.com/locustio/locust/pull/1375
        hardLimit: 10000,
        softLimit: 10000,
      });

    this.service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition: workerTaskDefinition,
      // You can adjust spot:on-demand ratio here
      desiredCount: props.desiredCount,
      capacityProviderStrategies: [
        {
          capacityProvider: 'FARGATE_SPOT',
          weight: 1,
        },
        {
          capacityProvider: 'FARGATE',
          weight: 0,
        },
      ],
      minHealthyPercent: 0,
    });
  }
}
