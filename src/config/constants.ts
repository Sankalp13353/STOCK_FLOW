export const APP_CONSTANTS = {
  API_PREFIX: '/api/v1',
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  PASSWORD_SALT_ROUNDS: 10,
  DEFAULT_RESERVATION_TTL_MINUTES: 15,
  OUTBOX_POLL_INTERVAL_MS: 1000,
  OUTBOX_BATCH_SIZE: 20,
  OUTBOX_MAX_RETRIES: 5,
  OUTBOX_LOCK_TTL_SECONDS: 60,
  MAX_CONSUMER_RETRIES: 3,
} as const;

export const EVENT_TYPES = {
  ORDER_CREATED: 'order.created',
  ORDER_CONFIRMED: 'order.confirmed',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_PAYMENT_FAILED: 'order.payment_failed',
  ORDER_RESERVATION_EXPIRED: 'order.reservation_expired',
} as const;

export const BROKER_TOPICS = {
  EXCHANGE: 'stockflow.events',
  DLX: 'stockflow.dlx',
  QUEUES: {
    ORDER_NOTIFICATIONS: 'order-notifications.queue',
    ORDER_NOTIFICATIONS_DLQ: 'order-notifications.dlq',
    INVENTORY_EVENTS: 'inventory-events.queue',
    INVENTORY_EVENTS_DLQ: 'inventory-events.dlq',
  },
  ROUTING_KEYS: {
    ALL_ORDER_EVENTS: 'order.*',
    INVENTORY_RELEVANT_EVENTS: 'order.#',
  },
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
} as const;

