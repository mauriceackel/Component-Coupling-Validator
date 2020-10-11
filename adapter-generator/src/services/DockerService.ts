import { exec } from "child_process";
import { STORAGE_PATH } from "../config/Config";
import path from 'path';
import crypto from 'crypto';

const dockerInstances = new Map<string, string>();

export async function startDocker(fileId: string, taskReportId: string) {
  const filePath = `${STORAGE_PATH}/${fileId}`;
  const { dockerId, ...res } = await spinUpDocker(filePath);
  dockerInstances.set(taskReportId, dockerId);
  return res;
}

export async function stopDocker(taskReportId: string) {
  const dockerId = dockerInstances.get(taskReportId);
  console.log(taskReportId, [...dockerInstances.entries()])
  if (dockerId === undefined) return;
  await spinDownDocker(dockerId);
}

export async function stopAll() {
  return Promise.all([...dockerInstances.values()].map(dockerId => spinDownDocker(dockerId)));
}

async function spinUpDocker(filePath: string): Promise<{ dockerId: string, port: string, token: string }> {
  const absoluteFilePath = path.resolve(filePath);
  const token = crypto.randomBytes(48).toString('hex');

  const run_command = `docker run -it -p 0.0.0.0::8080 -e PASSWORD=${token} -v "${absoluteFilePath}:/home/coder/project" -u "$(id -u):$(id -g)" -d codercom/code-server:latest`;

  return await new Promise<{ dockerId: string, port: string, token: string }>((resolve, reject) => {
    const docker_run = exec(run_command, (error, stdout, stderr) => {
      const dockerId = stdout;
      const port_command = `docker port ${dockerId}`;
      const docker_port = exec(port_command, (error, stdout, stderr) => {
        const match = stdout.match(/:([\d]+)/);
        if (match === null) {
          reject();
          return;
        }
        resolve({ dockerId, port: match[1], token });
      });
      docker_port.on('error', reject);
    });
    docker_run.on('error', reject);
  });
}

async function spinDownDocker(dockerId: string) {
  const stop_command = `docker stop ${dockerId}`;
  const remove_command = `docker rm ${dockerId}`;

  return await new Promise<{ dockerId: string, port: string }>((resolve, reject) => {
    const docker_stop = exec(stop_command);
    docker_stop.on('error', reject);
    docker_stop.on('close', () => {
      const docker_remove = exec(remove_command);
      docker_remove.on('error', reject);
      docker_remove.on('close', resolve);
    });
  });
}
