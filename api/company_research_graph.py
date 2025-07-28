import os
import re
import json
import textwrap
import asyncio
from typing import List, TypedDict
from pydantic import BaseModel, Field
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright
from langchain.schema import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.tools.tavily_search import TavilySearchResults
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import create_react_agent, ToolNode, tools_condition

# # 🔐 API Keys
# # os.environ["TAVILY_API_KEY"] = "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"

# # 📤 Output Schema
# class CompanyResearchOutput(BaseModel):
#     company_name: str
#     job_title: str
#     job_description: str
#     company_summary: str
#     preferred_qualifications: List[str] = Field(default_factory=list)
#     skillset: List[str] = Field(default_factory=list)
#     company_vision: str = ""
#     additional_notes: str = ""

# # 📦 Utilities
# def clean_text(text: str) -> str:
#     return re.sub(r"\s+", " ", re.sub(r"\\n|\\t|\n|\t", " ", text)).strip()

# def parse_llm_output(output: str) -> CompanyResearchOutput:
#     def extract(label):
#         match = re.search(rf"\*\*{label}:\*\*\s*(.*?)(?=\n\*\*|\Z)", output, re.DOTALL)
#         return clean_text(match.group(1)) if match else ""

#     def extract_list(label):
#         match = re.search(rf"\*\*{label}:\*\*\s*((?:\n- .+)+)", output)
#         return [clean_text(line[2:]) for line in match.group(1).splitlines() if line.strip()] if match else []

#     return CompanyResearchOutput(
#         company_name=extract("Company Name"),
#         job_title=extract("Job Title"),
#         job_description=extract("Job Description"),
#         company_summary=extract("Company Summary"),
#         preferred_qualifications=extract_list("Preferred Qualifications"),
#         skillset=extract_list("Skillset"),
#         company_vision=extract("Company Vision"),
#         additional_notes=extract("Additional Notes")
#     )

# # 🤖 LLM + Tools
# llm = ChatGoogleGenerativeAI(model='gemini-2.5-flash', google_api_key="AIzaSyANJ3NXIcSwHrcXMjFGueLNEEJh_pgFz70")
# search_tool = TavilySearchResults(max_results=5)

# react_agent = create_react_agent(llm, tools=[search_tool], prompt="""
# You are a job and company research expert. Extract real info and format:
# Strictly follow these RULES:
# 1. Extract only REAL information - no placeholders.
# 2. If any field is missing or incomplete, use the search tool to retrieve that information.
# 3. Avoid using \"not mentioned\" or \"not found\", \"not explicitly provided\" — instead, intelligently find from other sources.
# 4. Follow this exact format:
# **Company Name:** <actual>
# **Job Title:** <actual>
# **Job Description:**
#   <description text>
# **Company Summary:**
#   <company description>
# **Preferred Qualifications:** Educational Qualifications and any years of Experience asked also include.
# - <qualification 1>
# - <qualification 2>
# **Skillset:**
# - <skill 1>
# - <skill 2>
# **Company Vision:**
#   <vision or mission>
# **Additional Notes:**
#   <perks, hybrid policy, DEI, etc.>
# """)

# # 🌐 Scraper
# async def scrape_with_playwright(url: str) -> str:
#     try:
#         async with async_playwright() as p:
#             browser = await p.chromium.launch(headless=True)
#             page = await browser.new_page()
#             await page.goto(url, timeout=120000)
#             await asyncio.sleep(2)
#             await page.wait_for_load_state('networkidle')
#             html = await page.content()
#             await browser.close()
#             return html
#     except Exception as e:
#         print(f"⚠️ Scraping error: {e}")
#         return ""

# def extract_company_name_from_html(html: str) -> str:
#     soup = BeautifulSoup(html, "html.parser")
#     for tag in soup.find_all("meta"):
#         if tag.get("property") == "og:site_name":
#             return tag.get("content", "").strip()
#     if soup.title and "|" in soup.title.text:
#         return soup.title.text.split("|")[-1].strip()
#     return soup.title.text.strip() if soup.title else "Unknown"

# # 🧠 Node: Detect job page
# async def detect_node(state):
#     url = state["job_url"]
#     html = await scrape_with_playwright(url)
#     soup = BeautifulSoup(html, "html.parser")
#     text = soup.get_text(separator="\n").lower()

#     patterns = [r"/careers?", r"/jobs?", r"/apply", r"/hiring", r"job-detail", r"openings"]
#     match_url = any(re.search(p, url.lower()) for p in patterns)
#     title_hit = soup.title and any(k in soup.title.text.lower() for k in ["job", "role"])
#     meta_hit = any("job" in tag.get("content", "").lower() for tag in soup.find_all("meta"))
#     body_hit = sum(1 for k in ["job", "careers", "jobs", "intern", "career", "responsibility"] if k in text)

#     is_job = match_url or title_hit or meta_hit or body_hit >= 2

#     state.update({
#         "is_job_page": is_job,
#         "scraped_html": soup.get_text(),
#         "job_title": soup.title.text.strip() if soup.title else "Unknown Title",
#         "company_name": extract_company_name_from_html(html)
#     })
#     print(f"🧠 [detect_node] is_job_page = {is_job}, Title = {state['job_title']}, Company = {state['company_name']}")
#     return state

# # 🔎 Node: Search additional content
# async def search_node(state):
#     try:
#         company = state["company_name"]
#         url = state["job_url"]

#         def safe_run(query):
#             results = search_tool.run(query)
#             if isinstance(results, list):
#                 return "\n".join([r.get("content", "") for r in results])
#             elif isinstance(results, dict):
#                 return results.get("content", "")
#             else:
#                 return str(results)

#         state["search_results"] = safe_run(f"{company} site:{company.lower().replace(' ', '')}.com mission vision values culture")
#         state["job_search_results"] = safe_run(url)

#         print(f"🔎 [search_node] Search done")
#     except Exception as e:
#         print(f"⚠️ Search error: {e}")
#     return state

# # 📝 Node: Prepare agent input
# async def prepare_agent_input(state):
#     input_text = f"""
# Important:
# If it's a job board site, take out real hiring company details and not the job portal.
# JOB URL: {state['job_url']}
# JOB TITLE: {state['job_title']}
# COMPANY: {state['company_name']}

# SCRAPED CONTENT:
# {textwrap.shorten(state['scraped_html'], 3000)}

# COMPANY SEARCH RESULTS:
# {state.get('search_results', '')}

# JOB SEARCH RESULTS:
# {state.get('job_search_results', '')}
# """
#     state["messages"] = [HumanMessage(content=input_text)]
#     print("📝 [prepare_agent_input] Prompt prepared.")
#     return state

# # 📥 Node: Capture final output
# async def capture_output(state):
#     for msg in reversed(state.get("messages", [])):
#         if hasattr(msg, 'content'):
#             state["final_output"] = msg.content
#             print("📥 [capture_output] Output captured.")
#             break
#     return state

# # 📊 Graph State Definition
# class GraphState(TypedDict):
#     job_url: str
#     is_job_page: bool
#     scraped_html: str
#     job_title: str
#     company_name: str
#     search_results: str
#     job_search_results: str
#     messages: List
#     final_output: str

# # 🔧 Build LangGraph
# def build_graph():
#     graph = StateGraph(GraphState)
#     graph.add_node("detect", detect_node)
#     graph.add_node("search", search_node)
#     graph.add_node("prepare", prepare_agent_input)
#     graph.add_node("agent", react_agent)
#     graph.add_node("tools", ToolNode(tools=[search_tool]))
#     graph.add_node("capture", capture_output)

#     graph.set_entry_point("detect")
#     graph.add_conditional_edges("detect", lambda s: "search" if s["is_job_page"] else END, {"search": "search", END: END})
#     graph.add_edge("search", "prepare")
#     graph.add_edge("prepare", "agent")
#     graph.add_conditional_edges("agent", tools_condition)
#     graph.add_edge("tools", "agent")
#     graph.add_edge("agent", "capture")
#     graph.add_edge("capture", END)

#     return graph.compile()

# # 🚀 Public Runner
# async def run_job_research(job_url: str) -> CompanyResearchOutput | None:
#     graph = build_graph()
#     state = GraphState(
#         job_url=job_url, is_job_page=False, scraped_html="",
#         job_title="", company_name="", search_results="",
#         job_search_results="", messages=[], final_output=""
#     )
#     result = await graph.ainvoke(state)
#     if result.get("final_output"):
#         try:
#             parsed = parse_llm_output(result["final_output"])
#             return parsed
#         except Exception as e:
#             print(f"⚠️ Parse Error: {e}")
#     else:
#         print("❌ No LLM Output")
#     return None



# import nest_asyncio
# nest_asyncio.apply()

import os, re, json, textwrap, asyncio
from typing import List, TypedDict
from pydantic import BaseModel, Field
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright
# from langchain_groq import ChatGroq
from langchain_community.tools.tavily_search import TavilySearchResults
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import create_react_agent, ToolNode, tools_condition
from langchain.schema import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI

# 🔐 API Keys
# os.environ["TAVILY_API_KEY"] = "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"
# os.environ["GROQ_API_KEY"] = ""

# 📤 Output Schema
class CompanyResearchOutput(BaseModel):
    company_name: str
    job_title: str
    job_description: str
    company_summary: str
    preferred_qualifications: List[str] = Field(default_factory=list)
    skillset: List[str] = Field(default_factory=list)
    company_vision: str = ""
    additional_notes: str = ""

# 🧼 Utilities
def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"\\n|\\t|\n|\t", " ", text)).strip()

def parse_llm_output(output: str) -> CompanyResearchOutput:
    def extract(label):
        match = re.search(rf"\*\*{label}:\*\*\s*(.*?)(?=\n\*\*|\Z)", output, re.DOTALL)
        return clean_text(match.group(1)) if match else ""

    def extract_list(label):
        match = re.search(rf"\*\*{label}:\*\*\s*((?:\n- .+)+)", output)
        return [clean_text(line[2:]) for line in match.group(1).splitlines() if line.strip()] if match else []

    return CompanyResearchOutput(
        company_name=extract("Company Name"),
        job_title=extract("Job Title"),
        job_description=extract("Job Description"),
        company_summary=extract("Company Summary"),
        preferred_qualifications=extract_list("Preferred Qualifications"),
        skillset=extract_list("Skillset"),
        company_vision=extract("Company Vision"),
        additional_notes=extract("Additional Notes")
    )

# 🤖 Agent Setup
# llm = ChatGroq(model="deepseek-r1-distill-llama-70b", temperature=0.1)
llm = ChatGoogleGenerativeAI(model='gemini-2.5-flash', google_api_key="AIzaSyANJ3NXIcSwHrcXMjFGueLNEEJh_pgFz70")
search_tool = TavilySearchResults(max_results=5)

react_agent = create_react_agent(llm, tools=[search_tool], prompt="""
You are a job and company research expert. Extract real info and format:
Strictly Follow RULES:
1. Extract only REAL information - no placeholders.
2. If any field is missing or incomplete, use the search tool to retrieve that information. Also, search in the job summary info provided.
3. Avoid using "not mentioned" or "not found", "not explicitly provided" — instead, intelligently find from other sources.
4. Follow this exact format: And You should Return all the information in following format only, dont miss any fields!! And dont give Half information give full information you should complete with addtional notes at the end.
**Company Name:** <actual>
**Job Title:** <actual>
**Job Description:**
  <description text>
**Company Summary:**
  <company description>
**Preferred Qualifications:** Yrs of Experience mentioned, Educational Qualifications if any mentioned.
- <qualification 1>
- <qualification 2>
**Skillset:**
- <skill 1>
- <skill 2>
**Company Vision:**
  <vision or mission>
**Additional Notes:**
  <perks, hybrid policy, DEI, etc.>
""")

# 🌐 Scraper
async def scrape_with_playwright(url: str) -> str:
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.goto(url, timeout=120000)
            await page.wait_for_load_state('networkidle')
            html = await page.content()
            await asyncio.sleep(1)
            await browser.close()
            print("Scraped Successfully")
            return html
    except Exception as e:
        print(f"⚠️ Scraping error: {e}")
        return ""

def extract_company_name(soup: BeautifulSoup, job_title: str, body_text: str) -> str:
    title_match = re.search(r'[@|at]\s+([A-Za-z0-9&\-\.\'\s]+)', job_title, re.IGNORECASE)
    if title_match:
        print("extract company done by method 1")
        return title_match.group(1).strip()

    body_match = re.search(r"(?:join|we at|hiring at|from)\s+([A-Z][A-Za-z0-9&\-\.\'\s]{2,40})", body_text, re.IGNORECASE)
    if body_match:
        print("extract company done by method 2")
        return body_match.group(1).strip()

    for tag in soup.find_all("meta"):
        if tag.get("property") == "og:site_name":
            print("extract company done by method 3")
            return tag.get("content", "").strip()

    if soup.title and "|" in soup.title.text:
        print("extract company done by method 4")
        return soup.title.text.split("|")[-1].strip()

    return soup.title.text.strip() if soup.title else "Unknown"

# 🧠 Node: Detect job page
async def detect_node(state):
    url = state["job_url"]
    html = await scrape_with_playwright(url)
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(separator="\n").lower()

    patterns = [r"careers", r"jobs?",  r"job[-_\s]?listingr", r"job-listing", r"apply", r"openings", r"vacancy", r"position", r"role"]
    match_url = any(re.search(p, url.lower()) for p in patterns)
    title_hit = soup.title and any(k in soup.title.text.lower() for k in ["job", "role"])
    meta_hit = any("job" in tag.get("content", "").lower() for tag in soup.find_all("meta"))
    body_hit = sum(1 for k in ["job", "jobs", "career", "intern", "responsibility"] if k in text)

    is_job = match_url or title_hit or meta_hit or body_hit >= 1
    print("Is Job page: ?", is_job)
    state.update({
        "is_job_page": is_job,
        "scraped_html": soup.get_text(),
        "job_title": soup.title.text.strip() if soup.title else "Unknown Title",
        "company_name": extract_company_name(soup, state.get("job_title", ""), soup.get_text())
    })
    return state

# 🔍 Node: Search
async def search_node(state):
    try:
        company_name = state["company_name"]
        url = state["job_url"]

        def extract_content(result):
            # TavilySearchResults may return dicts or strings, handle both
            if isinstance(result, dict):
                return result.get("content", str(result))
            return str(result)

        search_results_raw = search_tool.run(f"{company_name} site:{company_name.lower().replace(' ', '')}.com mission vision values culture")
        state["search_results"] = "\n".join([extract_content(r) for r in (search_results_raw if isinstance(search_results_raw, list) else [search_results_raw])])

        job_search_results_raw = search_tool.run(url)
        state["job_search_results"] = "\n".join([extract_content(r) for r in (job_search_results_raw if isinstance(job_search_results_raw, list) else [job_search_results_raw])])

        job_summary_results = search_tool.run(url)
        state["job_summary_info"] = "\n".join([res['content'] for res in job_summary_results if 'content' in res])
    

        linkedin_slug = re.sub(r'[^\w\s-]', '', company_name.strip()).replace(' ', '-').lower()
        linkedin_results_raw = search_tool.run(f"{linkedin_slug} site:linkedin.com/company/{linkedin_slug}")
        state["linkedin_results"] = "\n".join([extract_content(r) for r in (linkedin_results_raw if isinstance(linkedin_results_raw, list) else [linkedin_results_raw])])

        print("Search done")
    except Exception as e:
        print(f"⚠️ Search error: {e}")
    return state

# 📝 Prepare Prompt + Log to File
async def prepare_agent_input(state):
    await asyncio.sleep(0.5)
    input_text = f"""
Important:
Take all the information from the below you got , and return all required fields and all information properly and well structured, if any info missing tool call and search again, search in job summary info also in below and return all.
Take skills mentioned properly and take only important, like be very specific if not found tavily search, also in preferred qualifications it should be educational qualifications and also if any experience of years asked,  mentioned and include it in preffered qualifications.
Even company name has given you but check if its proper hiring company name and not the job boards/portal name. Avoid job portal names for e.g like wellfound, linkedIN, greenhouse, etc. You should give output based on Hiring company name, so cross check company name.
JOB URL: {state['job_url']}
JOB TITLE: {state['job_title']}
COMPANY: {state['company_name']}

SCRAPED CONTENT:
{textwrap.shorten(state['scraped_html'], 3000)}

COMPANY SEARCH RESULTS:
{state.get('search_results', '')}

JOB SEARCH RESULTS:
{state.get('job_search_results', '')}

JOB SUMMARY INFO: If any information is missing, do not use "not mentioned" or "not found" or "not Provided". Instead, fill that missing fields by using this Job summary info and from search results.
{state.get('job_summary_info', '')} 

LINKEDIN SEARCH RESULTS: If Linkedin info present then from this search, take company's vision, latest projects they are working, their milestones in very short only.
{state.get('linkedin_results', '')}
"""
    state["messages"] = [HumanMessage(content=input_text)]
    print("Prepared input for an agent")
    return state

# 🎯 Capture Output
async def capture_output(state):
    for msg in reversed(state.get("messages", [])):
        if hasattr(msg, 'content'):
            state["final_output"] = msg.content
            break
    print("Captured output")
    return state

# 📊 Graph State
class GraphState(TypedDict):
    job_url: str
    is_job_page: bool
    scraped_html: str
    job_title: str
    company_name: str
    search_results: str
    job_search_results: str
    messages: List
    final_output: str

# Minimal GraphState for detection only
class DetectOnlyState(TypedDict):
    job_url: str
    is_job_page: bool
    scraped_html: str
    job_title: str
    company_name: str

# Build detection-only graph
def build_detect_only_graph():
    graph = StateGraph(DetectOnlyState)
    graph.add_node("detect", detect_node)
    graph.set_entry_point("detect")
    graph.add_edge("detect", END)
    return graph.compile()


# 🧠 Build Graph
def build_graph():
    graph = StateGraph(GraphState)
    graph.add_node("detect", detect_node)
    graph.add_node("search", search_node)
    graph.add_node("prepare", prepare_agent_input)
    graph.add_node("agent", react_agent)
    graph.add_node("tools", ToolNode(tools=[search_tool]))
    graph.add_node("capture", capture_output)

    graph.set_entry_point("detect")
    graph.add_conditional_edges("detect", lambda s: "search" if s["is_job_page"] else END, {"search": "search", END: END})
    graph.add_edge("search", "prepare")
    graph.add_edge("prepare", "agent")
    graph.add_conditional_edges("agent", tools_condition)
    graph.add_edge("tools", "agent")
    graph.add_edge("agent", "capture")
    graph.add_edge("capture", END)
    return graph.compile()

# 🚀 Runner
async def run_job_research(job_url: str):
    print(f"\n🔍 Processing: {job_url}")
    graph = build_graph()
    print("Graph built")
    state = GraphState(
        job_url=job_url, is_job_page=False, scraped_html="",
        job_title="", company_name="", search_results="",
        job_search_results="", messages=[], final_output=""
    )
    result = await graph.ainvoke(state)
    if result.get("final_output"):
        # print("✅ LLM Output:\n", result["final_output"][:800])
        try:
            parsed = parse_llm_output(result["final_output"])
            # with open("output_job_data.json", "w", encoding="utf-8") as f:
            #     json.dump(parsed.model_dump(), f, indent=2, ensure_ascii=False)
            return parsed
        except Exception as e:
            print(f"⚠️ Parse Error: {e}")
    else:
        print("❌ No LLM Output")
    return None
    