import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { redis } from '../src/infra/redis/redis.client';
import { productService } from '../src/modules/products/product.service';

interface BenchmarkMetrics {
  totalRequests: number;
  averageMs: number;
  medianMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  requestsPerSecond: number;
  cacheHitRatePercent: number;
}

function calculateMetrics(latencies: number[], hits: number, totalDurationSeconds: number): BenchmarkMetrics {
  const sorted = [...latencies].sort((a, b) => a - b);
  const total = sorted.reduce((sum, v) => sum + v, 0);
  const n = sorted.length;

  return {
    totalRequests: n,
    averageMs: Number((total / n).toFixed(2)),
    medianMs: Number(sorted[Math.floor(n * 0.5)].toFixed(2)),
    p95Ms: Number(sorted[Math.floor(n * 0.95)].toFixed(2)),
    minMs: Number(sorted[0].toFixed(2)),
    maxMs: Number(sorted[n - 1].toFixed(2)),
    requestsPerSecond: Number((n / totalDurationSeconds).toFixed(2)),
    cacheHitRatePercent: Number(((hits / n) * 100).toFixed(1)),
  };
}

async function runBenchmarkSuite() {
  console.log('====================================================');
  console.log('🚀 StockFlow Phase 5: Redis Performance Benchmark');
  console.log('====================================================');
  console.log('Testing Environment:');
  console.log(`- Node.js: ${process.version}`);
  console.log(`- Platform: ${process.platform} (${process.arch})`);
  console.log(`- Database: PostgreSQL (Local / Prisma)`);
  console.log(`- Cache: Redis 7-Alpine`);
  console.log('----------------------------------------------------\n');

  await redis.connect();
  if (!redis.isConnected()) {
    console.error('❌ Redis must be connected to run the benchmark.');
    process.exit(1);
  }

  // Ensure benchmark test products exist
  const sampleSku = 'BENCH-PROD-001';
  let product = await prisma.product.findUnique({ where: { sku: sampleSku } });
  if (!product) {
    product = await prisma.product.create({
      data: {
        sku: sampleSku,
        name: 'Benchmark Sample Product',
        description: 'Sample description for performance evaluation',
        priceCents: 9999,
        isActive: true,
      },
    });
  }

  const SAMPLE_SIZE = 100;

  // ----------------------------------------------------
  // TEST 1: Product Detail API (GET /api/v1/products/:id)
  // ----------------------------------------------------
  console.log(`[1/2] Benchmarking Product Detail API (${SAMPLE_SIZE} requests)...`);

  // A. Without Cache (Database Queries on every request)
  await redis.getClient()?.flushall();
  const detailNoCacheLatencies: number[] = [];
  let detailNoCacheHits = 0;
  const t0 = performance.now();

  for (let i = 0; i < SAMPLE_SIZE; i++) {
    // Invalidate cache before each call to force DB hit
    await redis.del(productService.getDetailCacheKey(product.id));
    const start = performance.now();
    const res = await request(app).get(`/api/v1/products/${product.id}`);
    const elapsed = performance.now() - start;
    detailNoCacheLatencies.push(elapsed);
    if (res.headers['x-cache'] === 'HIT') detailNoCacheHits++;
  }
  const totalDurationNoCache = (performance.now() - t0) / 1000;
  const detailNoCacheMetrics = calculateMetrics(detailNoCacheLatencies, detailNoCacheHits, totalDurationNoCache);

  // B. With Redis Cache
  await redis.getClient()?.flushall();
  // Warm cache with initial request
  await request(app).get(`/api/v1/products/${product.id}`);

  const detailCacheLatencies: number[] = [];
  let detailCacheHits = 0;
  const t1 = performance.now();

  for (let i = 0; i < SAMPLE_SIZE; i++) {
    const start = performance.now();
    const res = await request(app).get(`/api/v1/products/${product.id}`);
    const elapsed = performance.now() - start;
    detailCacheLatencies.push(elapsed);
    if (res.headers['x-cache'] === 'HIT') detailCacheHits++;
  }
  const totalDurationCache = (performance.now() - t1) / 1000;
  const detailCacheMetrics = calculateMetrics(detailCacheLatencies, detailCacheHits, totalDurationCache);

  // ----------------------------------------------------
  // TEST 2: Product Listing API (GET /api/v1/products)
  // ----------------------------------------------------
  console.log(`[2/2] Benchmarking Product Listing API (${SAMPLE_SIZE} requests)...`);

  // A. Without Cache
  await redis.getClient()?.flushall();
  const listNoCacheLatencies: number[] = [];
  let listNoCacheHits = 0;
  const t2 = performance.now();

  for (let i = 0; i < SAMPLE_SIZE; i++) {
    await redis.delByPattern('cache:products:list:*');
    const start = performance.now();
    const res = await request(app).get('/api/v1/products?page=1&limit=20');
    const elapsed = performance.now() - start;
    listNoCacheLatencies.push(elapsed);
    if (res.headers['x-cache'] === 'HIT') listNoCacheHits++;
  }
  const totalDurationListNoCache = (performance.now() - t2) / 1000;
  const listNoCacheMetrics = calculateMetrics(listNoCacheLatencies, listNoCacheHits, totalDurationListNoCache);

  // B. With Redis Cache
  await redis.getClient()?.flushall();
  // Warm cache
  await request(app).get('/api/v1/products?page=1&limit=20');

  const listCacheLatencies: number[] = [];
  let listCacheHits = 0;
  const t3 = performance.now();

  for (let i = 0; i < SAMPLE_SIZE; i++) {
    const start = performance.now();
    const res = await request(app).get('/api/v1/products?page=1&limit=20');
    const elapsed = performance.now() - start;
    listCacheLatencies.push(elapsed);
    if (res.headers['x-cache'] === 'HIT') listCacheHits++;
  }
  const totalDurationListCache = (performance.now() - t3) / 1000;
  const listCacheMetrics = calculateMetrics(listCacheLatencies, listCacheHits, totalDurationListCache);

  // ----------------------------------------------------
  // RESULTS DISPLAY
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log('📊 BENCHMARK COMPARISON RESULTS');
  console.log('====================================================\n');

  console.log('--- Product Detail API (GET /api/v1/products/:id) ---');
  console.table({
    'Without Cache (PostgreSQL)': {
      'Avg Latency (ms)': detailNoCacheMetrics.averageMs,
      'Median (p50) (ms)': detailNoCacheMetrics.medianMs,
      'p95 Latency (ms)': detailNoCacheMetrics.p95Ms,
      'Throughput (req/s)': detailNoCacheMetrics.requestsPerSecond,
      'Cache Hit Rate': `${detailNoCacheMetrics.cacheHitRatePercent}%`,
    },
    'With Redis Caching': {
      'Avg Latency (ms)': detailCacheMetrics.averageMs,
      'Median (p50) (ms)': detailCacheMetrics.medianMs,
      'p95 Latency (ms)': detailCacheMetrics.p95Ms,
      'Throughput (req/s)': detailCacheMetrics.requestsPerSecond,
      'Cache Hit Rate': `${detailCacheMetrics.cacheHitRatePercent}%`,
    },
  });

  const detailSpeedup = (detailNoCacheMetrics.averageMs / detailCacheMetrics.averageMs).toFixed(2);
  console.log(`⚡ Speedup Factor (Detail): ~${detailSpeedup}x faster with Redis Caching\n`);

  console.log('--- Product Listing API (GET /api/v1/products) ---');
  console.table({
    'Without Cache (PostgreSQL)': {
      'Avg Latency (ms)': listNoCacheMetrics.averageMs,
      'Median (p50) (ms)': listNoCacheMetrics.medianMs,
      'p95 Latency (ms)': listNoCacheMetrics.p95Ms,
      'Throughput (req/s)': listNoCacheMetrics.requestsPerSecond,
      'Cache Hit Rate': `${listNoCacheMetrics.cacheHitRatePercent}%`,
    },
    'With Redis Caching': {
      'Avg Latency (ms)': listCacheMetrics.averageMs,
      'Median (p50) (ms)': listCacheMetrics.medianMs,
      'p95 Latency (ms)': listCacheMetrics.p95Ms,
      'Throughput (req/s)': listCacheMetrics.requestsPerSecond,
      'Cache Hit Rate': `${listCacheMetrics.cacheHitRatePercent}%`,
    },
  });

  const listSpeedup = (listNoCacheMetrics.averageMs / listCacheMetrics.averageMs).toFixed(2);
  console.log(`⚡ Speedup Factor (Listing): ~${listSpeedup}x faster with Redis Caching\n`);

  await redis.disconnect();
  await prisma.$disconnect();
  console.log('✅ Benchmark execution completed cleanly.');
}

runBenchmarkSuite().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});

