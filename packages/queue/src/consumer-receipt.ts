export function createConsumerReceiptStore() {
  const receipts = new Set<string>();
  return {
    markTerminal(consumerName: string, eventId: string) {
      const key = `${consumerName}:${eventId}`;
      if (receipts.has(key)) return { inserted: false };
      receipts.add(key);
      return { inserted: true };
    },
    has(consumerName: string, eventId: string) {
      return receipts.has(`${consumerName}:${eventId}`);
    },
  };
}
