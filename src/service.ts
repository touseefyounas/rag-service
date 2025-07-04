import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { 
  RunnablePassthrough, 
  RunnableSequence 
} from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import { HttpResponseOutputParser } from "langchain/output_parsers";
import { RunnableWithMessageHistory } from "@langchain/core/runnables"; 
import { ChatMessageHistory } from "langchain/stores/message/in_memory";

import { clearDocuments, initializeVectorStoreWithDocuments, checkDocumentExists } from "./functions";
import { createDocumentRetrievalChain } from "./functions";
import { createRephraseQuestionChain } from "./functions";


let finalRetrievalChain: any;
let isInitialized = false;
let currentNamespace = 'default';

export const initializeSystem = async (splitDocs: any, namespace: string = 'default') => {
  console.log(`Processing ${splitDocs.length} document chunks`);
  
  const vectorStore = await initializeVectorStoreWithDocuments({ docs: splitDocs, namespace });
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
    using only the resources provided. Be verbose!

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

  const messageHistories: { [key: number]: ChatMessageHistory } = {};

  const getMessageHistoryForSession = (sessionId: number): ChatMessageHistory => {
    const newChatSessionHistory = messageHistories[sessionId] || new ChatMessageHistory();
    console.log(`Chat history for session ${sessionId}: `, newChatSessionHistory);
    return newChatSessionHistory;
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

export const documentStatus = async (namespace: string = 'default') => {
  try {
    return await checkDocumentExists(namespace);
  } catch (error) {
    console.error("Error checking document status:", error);
    return false;
  }
}

export const resetSystem = async (namespace: string ='default') => {
  await clearDocuments(namespace)
  isInitialized = false;
  finalRetrievalChain = null;
};

export const finalStream = async (sessionId: number, question: string) => {
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