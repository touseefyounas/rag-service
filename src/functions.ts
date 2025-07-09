const { config } = require('dotenv');
config();

import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";   
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { MessagesPlaceholder } from "@langchain/core/prompts";
import { Document } from "@langchain/core/documents";
import { RunnableSequence } from "@langchain/core/runnables";

import { getOrCreateVectorStore, upstashIndex } from "./vectorStore";

export const loadAndSplitChunks = async (
    {
    chunkSize, 
    chunkOverlap,
    filepath
    }:{
    chunkSize: number;
    chunkOverlap: number;
    filepath: string;
}) => {

    const loader = new PDFLoader(filepath);
    const docs = await loader.load();

    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: chunkSize,
        chunkOverlap: chunkOverlap,
    });
    const splitDocs = await splitter.splitDocuments(docs);
    return splitDocs;
}

export const addDocumentsToVectorStore = async (docs: Document[], namespace: string) => {
    const vectorStore = await getOrCreateVectorStore(namespace);
    await vectorStore.addDocuments(docs);
    console.log(`Added ${docs.length} documents to Upstash Vector (namespace: ${namespace})`);
}

export const checkDocumentExists = async (namespace: string = 'default') => {
    try {
        const stats = await upstashIndex.info();
        return stats;
    } catch (error) {
        console.error("Error checking document existence:", error);
        return false;
    }
}

export const clearDocuments = async (namespace: string = 'default'): Promise<void> => {
    try {
        await upstashIndex.reset({ namespace });
        console.log(`Cleared all documents in namespace: ${namespace}`);
    } catch (error) {
        console.error("Error clearing documents:", error);
    }
}

export const createDocumentRetrievalChain = (retriever: any) => {
    const convertDocsToString = (documents: Document[]): string => {
        console.log(`📄 Retrieved ${documents.length} documents`);
        return documents.map((document) => `<doc>\n${document.pageContent}\n</doc>`).join("\n");
    }

    const documentRetrievalChain = RunnableSequence.from([
        (input) => input.standalone_question,
        retriever,
        convertDocsToString,
    ]);

    return documentRetrievalChain;
}

export const createRephraseQuestionChain = () => {
  const REPHRASE_QUESTION_SYSTEM_TEMPLATE = `Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.`;

  const rephraseQuestionChainPrompt = ChatPromptTemplate.fromMessages([
    ["system", REPHRASE_QUESTION_SYSTEM_TEMPLATE],
    new MessagesPlaceholder("history"),
    ["human", "Rephrase the following question as a standalone question:\n{question}"],
  ]);
  
  const rephraseQuestionChain = RunnableSequence.from([
    rephraseQuestionChainPrompt,
    new ChatOpenAI({ temperature: 0.1, modelName: "gpt-4" }),
    new StringOutputParser(),
  ]);

  // Add logging wrapper to see the rephrased question
  const loggedRephraseChain = RunnableSequence.from([
    (input) => {
      console.log("Original question:", input.question);
      return input;
    },
    rephraseQuestionChain,
    (output) => {
      console.log("Rephrased question:", output);
      return output;
    }
  ]);

  return loggedRephraseChain;
}