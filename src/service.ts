
import { HttpResponseOutputParser } from "langchain/output_parsers";
import { RunnableWithMessageHistory } from "@langchain/core/runnables"; 
import { ChatMessageHistory } from "langchain/stores/message/in_memory";

import { clearDocuments, checkDocumentExists, } from "./RAG/ragFunctions";
import { getRagChain } from "./RAG/RAG";

import { getMemoryInstance } from "./Config/redis";

let ragFinalRetrievalChain: any;
let isInitialized = false;
let currentNamespace: string | null = null;

export const initializeSystem = async ( namespace: string) => {
  
  const ragConversationalRetrievalChain = await getRagChain(namespace);

  const httpResponseOutputParser = new HttpResponseOutputParser({
    contentType: "text/plain"
  });

  const getMessageHistoryForSession = (sessionId: string) => {
  return getMemoryInstance(sessionId).chatHistory;
};

  ragFinalRetrievalChain = new RunnableWithMessageHistory({
    runnable: ragConversationalRetrievalChain,
    getMessageHistory: getMessageHistoryForSession,
    inputMessagesKey: "question",
    historyMessagesKey: "history",
  }).pipe(httpResponseOutputParser);

  currentNamespace = namespace;
  isInitialized = true;
};

export const finalStream = async (sessionId: string, question: string,) => {
  if (!isInitialized) {
    throw new Error('System not initialized. Please upload a document first.');
  }
  
  const streamResponse = await ragFinalRetrievalChain.stream(
    { question },
    { configurable: { sessionId } }
  );

  return streamResponse;
};


export const isSystemInitialized = () => {
  return isInitialized;
};

export const documentStatus = async (namespace: string) => {
  try {
    return await checkDocumentExists(namespace);
  } catch (error) {
    console.error("Error checking document status:", error);
    return false;
  }
}

export const resetDocuments = async (namespace: string) => {
  await clearDocuments(namespace)
};

export const getCurrentNamespace = () => {
  return currentNamespace;
};