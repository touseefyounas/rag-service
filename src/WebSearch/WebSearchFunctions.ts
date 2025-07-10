import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { RunnablePassthrough, RunnableSequence, RunnableLambda } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import { SerpAPI } from "@langchain/community/tools/serpapi";

import { WEB_SEARCH_ANSWER_CHAIN_SYSTEM_TEMPLATE } from "../prompts";

// Function to create search query generation chain
const createSearchQueryChain = () => {
  const searchQueryPrompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are an expert at creating effective web search queries. 
      
      Given a user's question and chat history, create an optimized search query that will find the most relevant and current information.
      
      Rules for creating search queries:
      - Keep it concise (3-8 words typically work best)
      - Use specific keywords rather than full sentences
      - Include relevant time indicators if the question asks for recent information
      - Focus on the core topic/entity being asked about
      - Remove unnecessary words like "what", "how", "tell me about"
      
      Examples:
      - "What's the latest news about Tesla?" → "Tesla latest news 2024"
      - "How is the weather in New York today?" → "New York weather today"
      - "Tell me about recent AI developments" → "AI developments recent 2024"
      
      Return only the search query, nothing else.`
    ],
    new MessagesPlaceholder("history"),
    ["human", "{input}"]
  ]);

  return searchQueryPrompt.pipe(new ChatOpenAI({ modelName: "gpt-4o-mini", temperature: 0 }));
};

// Function to create web search execution chain
const createWebSearchChain = () => {
  const serpAPI = new SerpAPI();

  return RunnableLambda.from(async (input: { search_query: string }) => {
    try {
      const searchResults = await serpAPI.invoke({ query: input.search_query });
      
      // Format search results for better processing
      let formattedResults = "";
      if (typeof searchResults === 'string') {
        formattedResults = searchResults;
      } else if (typeof searchResults === 'object') {
        formattedResults = JSON.stringify(searchResults, null, 2);
      } else {
        formattedResults = String(searchResults);
      }

      return {
        search_results: formattedResults,
        search_query_used: input.search_query,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Search error:", error);
      return {
        search_results: "Error occurred while searching. Please try again.",
        search_query_used: input.search_query,
        timestamp: new Date().toISOString(),
        error: true,
      };
    }
  });
};

// Main web search chain function
export const getWebSearchChain = async () => {
  const searchQueryChain = createSearchQueryChain();
  const webSearchChain = createWebSearchChain();

  const answerGenerationChainPrompt = ChatPromptTemplate.fromMessages([
    ["system", WEB_SEARCH_ANSWER_CHAIN_SYSTEM_TEMPLATE],
    new MessagesPlaceholder("history"),
    [
      "human", 
      `Based on the search results below, please answer this question: {input}

      Search Query Used: {search_query_used}
      Search Results: {search_results}
      
      Please provide a comprehensive answer based on these search results.`
    ]
  ]);

  return RunnableSequence.from([
    // Step 1: Generate optimized search query
    RunnablePassthrough.assign({
      search_query: searchQueryChain,
    }),
    // Step 2: Execute web search
    RunnablePassthrough.assign({
      search_data: webSearchChain,
    }),
    // Step 3: Extract search results for the prompt
    RunnablePassthrough.assign({
      search_results: RunnableLambda.from((input: any) => input.search_data.search_results),
      search_query_used: RunnableLambda.from((input: any) => input.search_data.search_query_used),
    }),
    // Step 4: Generate final answer
    answerGenerationChainPrompt,
    new ChatOpenAI({ modelName: "gpt-4" }),
  ]);
};