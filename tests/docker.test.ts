import fs from 'fs';
import path from 'path';

describe('Docker & Containerization Configuration', () => {
  const rootDir = path.resolve(__dirname, '..');

  describe('Dockerfile Inspection', () => {
    const dockerfilePath = path.join(rootDir, 'Dockerfile');
    let dockerfileContent: string;

    beforeAll(() => {
      dockerfileContent = fs.readFileSync(dockerfilePath, 'utf-8');
    });

    it('should exist and define a multi-stage build using Node.js LTS', () => {
      expect(fs.existsSync(dockerfilePath)).toBe(true);
      expect(dockerfileContent).toMatch(/FROM node:20-alpine AS builder/i);
      expect(dockerfileContent).toMatch(/FROM node:20-alpine AS runner/i);
    });

    it('should compile TypeScript during the builder stage', () => {
      expect(dockerfileContent).toContain('npm run build');
      expect(dockerfileContent).toContain('npx prisma generate');
    });

    it('should prune development dependencies before runtime', () => {
      expect(dockerfileContent).toContain('npm prune --omit=dev');
    });

    it('should configure a non-root user (node) for container security', () => {
      expect(dockerfileContent).toContain('USER node');
    });

    it('should use tini for signal handling and expose the application port', () => {
      expect(dockerfileContent).toContain('ENTRYPOINT ["/sbin/tini", "--"]');
      expect(dockerfileContent).toContain('EXPOSE 4000');
    });
  });

  describe('.dockerignore Inspection', () => {
    const dockerignorePath = path.join(rootDir, '.dockerignore');
    let content: string;

    beforeAll(() => {
      content = fs.readFileSync(dockerignorePath, 'utf-8');
    });

    it('should exist and exclude node_modules, build outputs, and environment secrets', () => {
      expect(fs.existsSync(dockerignorePath)).toBe(true);
      expect(content).toContain('node_modules');
      expect(content).toContain('dist');
      expect(content).toContain('.env');
    });
  });

  describe('docker-compose.yml Inspection', () => {
    const composePath = path.join(rootDir, 'docker-compose.yml');
    let composeContent: string;

    beforeAll(() => {
      composeContent = fs.readFileSync(composePath, 'utf-8');
    });

    it('should define all 4 required services: api, worker, redis, rabbitmq', () => {
      expect(fs.existsSync(composePath)).toBe(true);
      expect(composeContent).toContain('api:');
      expect(composeContent).toContain('worker:');
      expect(composeContent).toContain('redis:');
      expect(composeContent).toContain('rabbitmq:');
    });

    it('should configure Redis with persistence and health check', () => {
      expect(composeContent).toContain('redis:7-alpine');
      expect(composeContent).toContain('redis_data:/data');
      expect(composeContent).toContain('redis-cli');
    });

    it('should configure RabbitMQ with management UI, persistence and health check', () => {
      expect(composeContent).toContain('rabbitmq:3.13-management-alpine');
      expect(composeContent).toContain('rabbitmq_data:/var/lib/rabbitmq');
      expect(composeContent).toContain('rabbitmq-diagnostics');
    });

    it('should separate API and Worker execution commands and service dependencies', () => {
      expect(composeContent).toMatch(/command:\s*\["node",\s*"dist\/worker\.js"\]/);
      expect(composeContent).toContain('depends_on:');
      expect(composeContent).toContain('service_healthy');
    });
  });

  describe('Railway Service Configurations (Config-as-Code)', () => {
    it('should configure stockflow-api with server.js startCommand and /health check in railway.json', () => {
      const apiConfigPath = path.join(rootDir, 'railway.json');
      expect(fs.existsSync(apiConfigPath)).toBe(true);
      const apiConfig = JSON.parse(fs.readFileSync(apiConfigPath, 'utf-8'));
      expect(apiConfig.build.builder).toBe('DOCKERFILE');
      expect(apiConfig.build.dockerfilePath).toBe('Dockerfile');
      expect(apiConfig.deploy.startCommand).toBe('node dist/server.js');
      expect(apiConfig.deploy.healthcheckPath).toBe('/health');
    });

    it('should configure stockflow-worker with worker.js startCommand and no health check in railway.worker.json', () => {
      const workerConfigPath = path.join(rootDir, 'railway.worker.json');
      expect(fs.existsSync(workerConfigPath)).toBe(true);
      const workerConfig = JSON.parse(fs.readFileSync(workerConfigPath, 'utf-8'));
      expect(workerConfig.build.builder).toBe('DOCKERFILE');
      expect(workerConfig.build.dockerfilePath).toBe('Dockerfile');
      expect(workerConfig.deploy.startCommand).toBe('node dist/worker.js');
      expect(workerConfig.deploy.healthcheckPath).toBeUndefined();
    });
  });
});

