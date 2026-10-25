import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.PICOLAH_BASE_URL || 'http://127.0.0.1:8787';

export const options = {
  scenarios: {
    health: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 10),
      duration: __ENV.DURATION || '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<800'],
  },
};

export default function () {
  const response = http.get(`${BASE}/api/health`);
  check(response, {
    'health 200': (result) => result.status === 200,
    'health json': (result) => result.json('ok') === true,
  });
  sleep(1);
}
