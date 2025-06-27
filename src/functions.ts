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


export const loadAndSplitChunks = async (
    {
    chunkSize, 
    chunkOverlap
    }:{
    chunkSize: number;
    chunkOverlap: number;
}) => {

    const loader = new PDFLoader('./MachineLearning-Lecture01.pdf');
    const docs = await loader.load();

    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: chunkSize,
        chunkOverlap: chunkOverlap,
    });
    const splitDocs = await splitter.splitDocuments(docs);
    return splitDocs;
}

export const initializeVectorStoreWithDocuments = async ({docs}: { docs: Document[] }) => {
    const embeddings = new OpenAIEmbeddings();
    const vectorstore = new MemoryVectorStore(embeddings);
    await vectorstore.addDocuments(docs);
    const retriever = vectorstore.asRetriever();
    return vectorstore;
}

export const createDocumentRetrievalChain = (retriever: any) => {
    const convertDocsToString = (documents: Document[]): string => {
        return documents.map((document) => `<doc>\n${document.pageContent}\n</doc>`).join("\n");
    }

    const documentRetrievalChain = RunnableSequence.from([
        (input) => input.standalone_question,
        retriever,
        convertDocsToString,
    ])

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
  return rephraseQuestionChain;
}