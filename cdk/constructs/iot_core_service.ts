import { Construct } from 'constructs';
import { ThingWithCert } from 'cdk-iot-core-certificates';

export interface IoTCoreServiceProps {
  readonly thingName: string;
}

// Refer: https://docs.aws.amazon.com/cdk/api/v1/docs/aws-iot-readme.html
export class IoTCoreService extends Construct {
  public readonly service: ThingWithCert;
  public readonly paramPrefix = '/iot-simulator-with-fault-injection';
  constructor(scope: Construct, id: string, props: IoTCoreServiceProps) {
    super(scope, id);

    const { thingName } = props;

    // Creating X.509 certificate for IoT Thing and attaching it with policy is cumbersome
    // Below module automatically generates certificates, policies and attach them with thing.
    // Refer: https://www.npmjs.com/package/cdk-iot-core-certificates for more info.
    // Creates new AWS IoT Thing called thingName
    // Saves certs to /devices/thingName/certPem and /devices/thingName/privKey
    this.service = new ThingWithCert(this, 'ThingWithCert', {
      thingName: thingName,
      saveToParamStore: true,
      paramPrefix: this.paramPrefix,
    });
  }
}
