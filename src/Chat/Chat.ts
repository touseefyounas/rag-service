import { LLM_CHAT_SYSTEM_TEMPLATE} from "../prompts";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";

export const createChatChain = () =>{
    const chatPrompt = ChatPromptTemplate.fromMessages([
        ["system", LLM_CHAT_SYSTEM_TEMPLATE],
        ["human", "{question}"]
    ]);

    const llm = new ChatOpenAI({ modelName: "gpt-4o-mini", temperature: 0.7 });

    return chatPrompt.pipe(llm).pipe(new StringOutputParser());

}   