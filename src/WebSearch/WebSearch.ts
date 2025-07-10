import { SerpAPI } from "@langchain/community/tools/serpapi";
import { ChatOpenAI } from "@langchain/openai";

import { HumanMessage } from "@langchain/core/messages";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableLambda } from "@langchain/core/runnables";

const tool = new SerpAPI();

export const getWebSearchChain = async (userInput: string) => {
    const llm = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0,
    });

const prompt = ChatPromptTemplate.fromMessages([
  ["system", "You are a helpful assistant."],
  ["placeholder", "{messages}"],
]);

const llmWithTools = llm.bindTools([tool]);

const chain = prompt.pipe(llmWithTools);

return RunnableLambda.from(async (userInput: string, config) => {
  const humanMessage = new HumanMessage(userInput);
  const aiMsg = await chain.invoke(
    {
      messages: [new HumanMessage(userInput)],
    },
    config
  );
  const toolMsgs = await tool.batch(aiMsg.tool_calls ?? [], config);
  return chain.invoke(
    {
      messages: [humanMessage, aiMsg, ...toolMsgs],
    },
    config
  );
});
}


