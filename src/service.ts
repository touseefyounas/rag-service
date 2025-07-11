
import { HttpResponseOutputParser } from "langchain/output_parsers";
import { RunnableWithMessageHistory } from "@langchain/core/runnables"; 
import { ChatMessageHistory } from "langchain/stores/message/in_memory";

import { clearDocuments, checkDocumentExists, } from "./RAG/ragFunctions";
import { getRagChain } from "./RAG/RAG";
import { getWebSearchChain } from "./WebSearch/WebSearch";

import { getMemoryInstance } from "./Config/redis";
import { createChatChain } from "./Chat/Chat";

let ragFinalRetrievalChain: any;
let webFinalChain: any;
let chatFinalChain: any;
let isInitialized = false;
let currentNamespace: string | null = null;

export const initializeSystem = async ( namespace: string) => {
  
  const ragConversationalRetrievalChain = await getRagChain(namespace);
  const webSearchChain = await getWebSearchChain();
  const chatChain = createChatChain();

  const httpResponseOutputParser = new HttpResponseOutputParser({
    contentType: "text/plain"
  });

  const getMessageHistoryForSession = (sessionId: string) => {
  return getMemoryInstance(sessionId).chatHistory;
  };

  chatFinalChain = new RunnableWithMessageHistory({
    runnable: chatChain,
    getMessageHistory: getMessageHistoryForSession,
    inputMessagesKey: "question",
    historyMessagesKey: "history",
  }).pipe(httpResponseOutputParser);

  webFinalChain = new RunnableWithMessageHistory({
    runnable: webSearchChain,
    getMessageHistory: getMessageHistoryForSession,
    inputMessagesKey: "question",
    historyMessagesKey: "history",
  }).pipe(httpResponseOutputParser);

  ragFinalRetrievalChain = new RunnableWithMessageHistory({
    runnable: ragConversationalRetrievalChain,
    getMessageHistory: getMessageHistoryForSession,
    inputMessagesKey: "question",
    historyMessagesKey: "history",
  }).pipe(httpResponseOutputParser);

  currentNamespace = namespace;
  isInitialized = true;
};

export const finalStream = async (sessionId: string, question: string, mode: string) => {
  if (!isInitialized) {
    throw new Error('System not initialized.');
  }

  switch (mode) {
    case 'web':
      if (!webFinalChain) {
        throw new Error('Web search chain not initialized.');
      }
      return await webFinalChain.stream(
        { question },
        { configurable: { sessionId } }
      );
    case 'rag':
      if (!ragFinalRetrievalChain) {
        throw new Error('RAG chain not initialized.');
      }
      return await ragFinalRetrievalChain.stream(
      { question },
      { configurable: { sessionId } }
    );
    case 'chat':
      if (!chatFinalChain) {
        throw new Error('Chat chain not initialized.');
      }
      return await chatFinalChain.stream(
        { question },
        { configurable: { sessionId } }
      ); 
    default:
      throw new Error(`Unknown mode: ${mode}. Use 'web' or 'rag'.`);
  }
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