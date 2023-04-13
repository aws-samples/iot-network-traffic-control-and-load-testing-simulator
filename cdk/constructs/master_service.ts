import { Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { ApplicationProtocol, SslPolicy } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { LocustLoadTestingWorkerService, LocustTrafficControlWorkerService } from './worker_service';

export interface LocustMasterServiceProps {
  readonly image: ecs.ContainerImage;
  readonly cluster: ecs.ICluster;
  readonly awsDefaultRegion?: string;
  readonly iotCoreEndpoint: string;
  readonly iotCoreMqttTopic: string;
  readonly paramStoreCertPath: string;
  readonly paramStorePrivPath: string;
  readonly certificateArn?: string;
  readonly allowedCidrs: string[];
  readonly logBucket: IBucket;
  readonly webUsername?: string;
  readonly webPassword?: string;
}

export class LocustMasterService extends Construct {
  public readonly configMapHostname: string;
  private readonly service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: LocustMasterServiceProps) {
    super(scope, id);

    const { cluster, image, webUsername, webPassword } = props;

    const configMapName = 'master';

    const protocol = props.certificateArn != null ? ApplicationProtocol.HTTPS : ApplicationProtocol.HTTP;

    let certificate = undefined;
    if (props.certificateArn != null) {
      certificate = Certificate.fromCertificateArn(this, 'Cert', props.certificateArn);
    }

    const masterTaskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      cpu: 1024,
      memoryLimitMiB: 2048,
    });

    const command = ['--master'];
    if (webUsername != null && webPassword != null) {
      command.push('--web-auth');
      command.push(`${webUsername}:${webPassword}`);
    }

    masterTaskDefinition.addContainer('locust-master', {
      image,
      command,
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'locust-master',
        logRetention: RetentionDays.ONE_WEEK,
      }),
      portMappings: [
        {
          containerPort: 8089,
        },
      ],
      environment: {
        IOT_CORE_ENDPOINT: props.iotCoreEndpoint,
        IOT_CORE_MQTT_TOPIC: props.iotCoreMqttTopic,
        PARAM_STORE_CERT_PATH: props.paramStoreCertPath,
        PARAM_STORE_PRIV_PATH: props.paramStorePrivPath,
      },
    });

    const master = new ApplicationLoadBalancedFargateService(this, 'Service', {
      cluster,
      // We only need just one instance for Locust master
      desiredCount: 1,
      targetProtocol: ApplicationProtocol.HTTP,
      openListener: false,
      cloudMapOptions: {
        name: configMapName,
      },
      cpu: 1024,
      memoryLimitMiB: 2048,
      taskDefinition: masterTaskDefinition,
      healthCheckGracePeriod: Duration.seconds(20),
      protocol,
      certificate,
      sslPolicy: protocol == ApplicationProtocol.HTTPS ? SslPolicy.RECOMMENDED : undefined,
      circuitBreaker: { rollback: true },
    });

    // https://github.com/aws/aws-cdk/issues/4015
    master.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '10');

    master.targetGroup.configureHealthCheck({
      interval: Duration.seconds(15),
      healthyThresholdCount: 2,
      // regard 401 as healthy because we cannot use basic auth for health check
      healthyHttpCodes: '200,401',
    });

    const port = protocol == ApplicationProtocol.HTTPS ? 443 : 80;
    props.allowedCidrs.forEach((cidr) =>
      master.loadBalancer.connections.allowFrom(ec2.Peer.ipv4(cidr), ec2.Port.tcp(port)),
    );

    master.loadBalancer.logAccessLogs(props.logBucket, 'locustAlbAccessLog');

    this.service = master.service;
    this.configMapHostname = `${configMapName}.${cluster.defaultCloudMapNamespace!.namespaceName}`;
  }

  public allowWorkerConnectionFrom(worker: LocustTrafficControlWorkerService | LocustLoadTestingWorkerService) {
    // 5557 is a port number from which master accept connection from workers
    // https://docs.locust.io/en/2.8.1/running-distributed.html
    this.service.connections.allowFrom(worker.service, ec2.Port.tcp(5557));
  }
}
