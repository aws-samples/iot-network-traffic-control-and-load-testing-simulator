import os

import boto3

if __name__ == '__main__':
    # === NOTE(@jjinj) ===========================================================================
    #  Since we run container from EC2Task, the container does not have any AWS credential info
    #  thus, fetching parameter from SSM throws error. If EC2Tasks can be configured with custom
    #  docker network, we can skip this part and make code clean.
    # ============================================================================================
    param_store_cert_path = os.environ.get("PARAM_STORE_CERT_PATH", None)
    param_store_priv_path = os.environ.get("PARAM_STORE_PRIV_PATH", None)

    ca_file = "certificate/AmazonRootCA1.pem"
    priv_file = "certificate/private.pem.key"
    cert_file = "certificate/certificate.pem.crt"

    # Get certificates from AWS IoT Core
    ssm = boto3.client('ssm')
    cert_string = ssm.get_parameter(Name=param_store_cert_path, WithDecryption=False)['Parameter']['Value']
    priv_string = ssm.get_parameter(Name=param_store_priv_path, WithDecryption=False)['Parameter']['Value']
    with open(cert_file, 'w+') as f:
        f.write(cert_string)
    with open(priv_file, 'w+') as f:
        f.write(priv_string)
