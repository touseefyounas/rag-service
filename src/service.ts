import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { 
  RunnablePassthrough, 
  RunnableSequence 
} from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import { HttpResponseOutputParser } from "langchain/output_parsers";
import { RunnableWithMessageHistory } from "@langchain/core/runnables"; 
import { ChatMessageHistory } from "langchain/stores/message/in_memory";

import { loadAndSplitChunks } from "./functions";
import { initializeVectorStoreWithDocuments } from "./functions";
import { createDocumentRetrievalChain } from "./functions";
import { createRephraseQuestionChain } from "./functions";

let finalRetrievalChain: any;
let isInitialized = false;

const initializeSystem = async () => {
  if (isInitialized) return;

  const splitDocs = await loadAndSplitChunks({
    chunkSize: 1536,
    chunkOverlap: 200,
  });

  const vectorStore = await initializeVectorStoreWithDocuments({ docs: splitDocs });
  const retriever = vectorStore.asRetriever();

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

  const getMessageHistoryForSession = (sessionId: number) => {
    if (messageHistories[sessionId] !== undefined) {
      return messageHistories[sessionId];
    } 
    const newChatSessionHistory = new ChatMessageHistory();
    messageHistories[sessionId] = newChatSessionHistory;
    return newChatSessionHistory;
  };

  finalRetrievalChain = new RunnableWithMessageHistory({
    runnable: conversationalRetrievalChain,
    getMessageHistory: getMessageHistoryForSession,
    inputMessagesKey: "question",
    historyMessagesKey: "history",
  }).pipe(httpResponseOutputParser);

  isInitialized = true;
};

export const finalStream = async (sessionId: number, question: string) => {
  
  await initializeSystem();
  
  const streamResponse = await finalRetrievalChain.stream(
    { question },
    { configurable: { sessionId } }
  );

  return streamResponse;
};