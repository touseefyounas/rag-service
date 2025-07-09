import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { 
  RunnablePassthrough, 
  RunnableSequence 
} from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import { HttpResponseOutputParser } from "langchain/output_parsers";
import { RunnableWithMessageHistory } from "@langchain/core/runnables"; 
import { ChatMessageHistory } from "langchain/stores/message/in_memory";

import { 
  clearDocuments, 
  checkDocumentExists, 
  createDocumentRetrievalChain, 
  createRephraseQuestionChain 
} from "./functions";

import { getOrCreateVectorStore } from "./vectorStore";

import { getMemoryInstance } from "./Config/redis";


let finalRetrievalChain: any;
let isInitialized = false;
let currentNamespace: string | null = null;

export const initializeSystem = async ( namespace: string) => {
  
  const vectorStore = await getOrCreateVectorStore(namespace);
  const retriever = vectorStore.asRetriever({
    k:4,
    searchType: "similarity",
  });

  const documentRetrievalChain = createDocumentRetrievalChain(retriever);
  const rephraseQuestionChain = createRephraseQuestionChain();

  const ANSWER_CHAIN_SYSTEM_TEMPLATE = `You are an experienced researcher,
    expert at interpreting and answering questions based on provided sources.
    Using the below provided context and chat history, 
    answer the user's question to the best of your ability
    using only the resources provided.

    <context>
    {context}
    </context>`;

  const answerGenerationChainPrompt = ChatPromptTemplate.fromMessages([
    ["system", ANSWER_CHAIN_SYSTEM_TEMPLATE],
    new MessagesPlaceholder("history"),
    [
      "human", 
      `Now, answer this question using the previous context and chat history:
    
      {standalone_question}`
    ]
  ]);

  const conversationalRetrievalChain = RunnableSequence.from([
    RunnablePassthrough.assign({
      standalone_question: rephraseQuestionChain,
    }),
    RunnablePassthrough.assign({
      context: documentRetrievalChain,
    }),
    answerGenerationChainPrompt,
    new ChatOpenAI({ modelName: "gpt-4" }),
  ]);

  const httpResponseOutputParser = new HttpResponseOutputParser({
    contentType: "text/plain"
  });

  const getMessageHistoryForSession = (sessionId: string) => {
  return getMemoryInstance(sessionId).chatHistory;
};

  finalRetrievalChain = new RunnableWithMessageHistory({
    runnable: conversationalRetrievalChain,
    getMessageHistory: getMessageHistoryForSession,
    inputMessagesKey: "question",
    historyMessagesKey: "history",
  }).pipe(httpResponseOutputParser);

  currentNamespace = namespace;
  isInitialized = true;
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

export const finalStream = async (sessionId: string, question: string) => {
  if (!isInitialized) {
    throw new Error('System not initialized. Please upload a document first.');
  }
  
  console.log(`Starting RAG query for session ${sessionId}`);
  
  const streamResponse = await finalRetrievalChain.stream(
    { question },
    { configurable: { sessionId } }
  );

  return streamResponse;
};

export const getCurrentNamespace = () => {
  return currentNamespace;
};