import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { RunnableLambda } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { SerpAPI } from "@langchain/community/tools/serpapi";


export const createSearchQueryChain = () => {
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
    ["human", "{question}"]
  ]);

  return searchQueryPrompt.pipe(new ChatOpenAI({ modelName: "gpt-4o-mini", temperature: 0 })).pipe(new StringOutputParser());
};

export const createWebSearchChain = () => {
  const serpAPI = new SerpAPI();

  return RunnableLambda.from(async (input: { search_query: string }) => {
    try {
      console.log("🔍 WebSearchChain received input:", input);
      console.log("🔍 Search query value:", input.search_query);
      console.log("🔍 Search query type:", typeof input.search_query);
      
      if (!input.search_query || input.search_query.trim() === '') {
        throw new Error('Empty search query received');
      }
      
      const searchResults = await serpAPI.invoke(input.search_query );
      
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

