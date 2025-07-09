import { OpenAIEmbeddings } from "@langchain/openai";
import { Index } from "@upstash/vector";
import { UpstashVectorStore } from '@langchain/community/vectorstores/upstash';

export const upstashIndex = new Index({
    url: process.env.UPSTASH_VECTOR_REST_URL,
    token: process.env.UPSTASH_VECTOR_REST_TOKEN,
});

const vectorStoreMap: Record<string, UpstashVectorStore> = {};

const getVectorStoreForSession = async (namespace: string) =>{
    const embeddings = new OpenAIEmbeddings();
    return new UpstashVectorStore(embeddings, {
        index: upstashIndex,
        namespace: namespace,
    });
}

export const getOrCreateVectorStore = async (namespace: string) => {
    if (!vectorStoreMap[namespace]) {
        vectorStoreMap[namespace] = await getVectorStoreForSession(namespace);
    }
    return vectorStoreMap[namespace];
}
