import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as LoadTest from '../cdk/iotFaultInjectionStack';
import { Mode } from '../cdk/mode_enums';

test('Snapshot test', () => {
  const app = new cdk.App();
  // WHEN
  const stack = new LoadTest.IoTFaultInjectionSimulatorStack(app, 'MyTestStack', {
    mode: Mode.NORMAL,
    workerDesiredCount: 0,
    iotCoreEndpoint: '',
    iotCoreMqttTopic: '',
    iotThingName: '',
    env: {
      region: 'us-west-2',
    },
    allowedCidrs: ['0.0.0.0/0'],
  });
  // THEN
  const template = Template.fromStack(stack);
  expect(template).toMatchSnapshot();
});
