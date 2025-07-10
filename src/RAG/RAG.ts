import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { RunnablePassthrough, RunnableSequence } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";

import { RAG_ANSWER_CHAIN_SYSTEM_TEMPLATE } from "../prompts";
import { getOrCreateVectorStore } from "../vectorStore";
import { createDocumentRetrievalChain, createRephraseQuestionChain } from "./ragFunctions";


export const getRagChain = async(namespace: string) => {
    const vectorStore = await getOrCreateVectorStore(namespace);
    const retriever = vectorStore.asRetriever({
        k: 4,
        searchType: "similarity",
    });

    const documentRetrievalChain = createDocumentRetrievalChain(retriever);
    const rephraseQuestionChain = createRephraseQuestionChain();

    const answerGenerationChainPrompt = ChatPromptTemplate.fromMessages([
        ["system", RAG_ANSWER_CHAIN_SYSTEM_TEMPLATE],
        new MessagesPlaceholder("history"),
        [
          "human", 
          `Now, answer this question using the previous context and chat history:
        
          {standalone_question}`
        ]
      ]);

    return RunnableSequence.from([
        RunnablePassthrough.assign({
            standalone_question: rephraseQuestionChain,
        }),
        RunnablePassthrough.assign({
            context: documentRetrievalChain,
        }),
        answerGenerationChainPrompt,
        new ChatOpenAI({ modelName: "gpt-4" }),
        ]);
}