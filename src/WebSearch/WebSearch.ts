
import { ChatOpenAI } from "@langchain/openai";

import { HumanMessage } from "@langchain/core/messages";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableLambda, RunnablePassthrough, RunnableSequence } from "@langchain/core/runnables";
import { createSearchQueryChain, createWebSearchChain } from "./WebSearchFunctions";
import { WEB_SEARCH_ANSWER_CHAIN_SYSTEM_TEMPLATE } from "../prompts";
import { MessagesPlaceholder } from "@langchain/core/prompts";  

export const getWebSearchChain = async () => {
  const searchQueryChain = createSearchQueryChain();
  const webSearchChain = createWebSearchChain();

  const answerGenerationChainPrompt = ChatPromptTemplate.fromMessages([
    ["system", WEB_SEARCH_ANSWER_CHAIN_SYSTEM_TEMPLATE],
    new MessagesPlaceholder("history"),
    [
      "human", 
      `Based on the search results below, please answer this question: {question}

      Search Query Used: {search_query_used}
      Search Results: {search_results}
      
      Please provide a comprehensive answer based on these search results.`
    ]
  ]);

  return RunnableSequence.from([
    RunnablePassthrough.assign({
      search_query: searchQueryChain,
    }),
    // Debug logging and call webSearchChain
    RunnablePassthrough.assign({
      search_data: RunnableLambda.from(async (input: any) => {
        console.log("🔍 Search query to use:", input.search_query);
        return webSearchChain.invoke({ search_query: input.search_query });
      }),
    }),
    RunnablePassthrough.assign({
      question: (input) => input.question,
      search_results: RunnableLambda.from((input: any) => input.search_data.search_results),
      search_query_used: RunnableLambda.from((input: any) => input.search_data.search_query_used),
    }),
    answerGenerationChainPrompt,
    new ChatOpenAI({ modelName: "gpt-4" }),
  ]);
};

// return RunnableLambda.from(async (userInput: string, config) => {
//   const humanMessage = new HumanMessage(userInput);
//   const aiMsg = await chain.invoke(
//     {
//       messages: [new HumanMessage(userInput)],
//     },
//     config
//   );
//   const toolMsgs = await tool.batch(aiMsg.tool_calls ?? [], config);
//   return chain.invoke(
//     {
//       messages: [humanMessage, aiMsg, ...toolMsgs],
//     },
//     config
//   );
// });



