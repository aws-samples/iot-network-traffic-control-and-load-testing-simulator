import { CfnOutput, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { AssetImage } from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { LocustMasterService } from './constructs/master_service';
import { IoTCoreService } from './constructs/iot_core_service';
import { LocustLoadTestingWorkerService } from './constructs/worker_service';


interface IoTLoadTestingSimulatorStackProps extends StackProps {
  readonly allowedCidrs: string[];
  readonly mqttWaitTime: number;
  readonly workerDesiredCount: number;
  readonly mqttQos: number;
  readonly mqttMessage: string;
  readonly iotCoreEndpoint: string;
  readonly iotCoreMqttTopic: string;
  readonly iotThingName: string;
  readonly certificateArn?: string;
  readonly webUsername?: string;
  readonly webPassword?: string;
}

export class IoTLoadTestingSimulatorStack extends Stack {
  private readonly locustMasterService: LocustMasterService;
  private readonly locustWorkerService: LocustLoadTestingWorkerService;
  private readonly ioTCoreService: IoTCoreService;

  constructor(scope: Construct, id: string, props: IoTLoadTestingSimulatorStackProps) {
    super(scope, id, props);

    // Create VPC
    const vpc = new ec2.Vpc(this, 'Vpc', {
      natGateways: 1,
    });

    // Create VPC Log Flow
    const logBucket = new Bucket(this, 'LogBucket', {
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });

    // Uncomment this if you don't need VPC flow logs.
    vpc.addFlowLog('FlowLogS3', {
      destination: ec2.FlowLogDestination.toS3(logBucket, 'vpcFlowLog'),
    });

    // Add explicit dependency https://github.com/aws/aws-cdk/issues/18985
    vpc.node.findChild('FlowLogS3').node.findChild('FlowLog').node.addDependency(logBucket);

    // Create IoT Core related stacks
    this.ioTCoreService = new IoTCoreService(this, 'IoTCore', {
      thingName: props.iotThingName,
    });

    // Create ECS cluster
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      defaultCloudMapNamespace: { name: 'iot-simulator' },
      containerInsights: true,
    });

    // Parameters that are used commonly across all Services
    const locustParams = {
      certificateArn: props.certificateArn,
      allowedCidrs: props.allowedCidrs,
      logBucket: logBucket,
      webUsername: props.webUsername,
      webPassword: props.webPassword,
    };
    const mqttParams = {
      mqttWaitTime: props.mqttWaitTime,
      mqttQos: props.mqttQos,
      mqttMessage: props.mqttMessage,
    };
    const iotParams = {
      iotCoreEndpoint: props.iotCoreEndpoint,
      iotCoreMqttTopic: props.iotCoreMqttTopic,
      paramStoreCertPath: `${this.ioTCoreService.paramPrefix}/${props.iotThingName}/certPem`,
      paramStorePrivPath: `${this.ioTCoreService.paramPrefix}/${props.iotThingName}/privKey`,
      awsDefaultRegion: props.env?.region,
    };

    // Create Locust Master & Worker nodes
    this.locustMasterService = new LocustMasterService(this, 'LocustLTMaster', {
      image: new AssetImage('app', {
        file: 'docker/master.Dockerfile',
      }),
      cluster,
      ...locustParams,
      ...iotParams,
    });
    this.locustWorkerService = new LocustLoadTestingWorkerService(this, 'LocustLTWorker', {
      image: new AssetImage('app', {
        file: 'docker/normal.Dockerfile',
      }),
      cluster,
      desiredCount: props.workerDesiredCount,
      ...iotParams,
      ...mqttParams,
    });
    this.locustMasterService.allowWorkerConnectionFrom(this.locustWorkerService);

    // CloudFormation logging
    new CfnOutput(this, 'WorkerServiceName', {
      value: this.locustWorkerService.service.serviceName,
    });

    new CfnOutput(this, 'EcsClusterArn', {
      value: cluster.clusterArn,
    });
  }
}
