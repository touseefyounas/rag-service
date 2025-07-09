import { Redis } from '@upstash/redis';
import { BufferMemory } from "langchain/memory";
import { UpstashRedisChatMessageHistory } from "@langchain/community/stores/message/upstash_redis";

const client = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const getMemoryInstance = (sessionId: string) => {
  return new BufferMemory({
    chatHistory: new UpstashRedisChatMessageHistory({
      sessionId,
      client,
    }),
    returnMessages: true,
    memoryKey: "chat_history",
  });
}
