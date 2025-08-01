import asyncio
from celery import Celery
from kombu import Queue
import nest_asyncio

from agents.langgraph_workflow.unified_workflow import build_graph
from company_research_graph import run_job_research

# Apply nest_asyncio once at the start of your Celery worker's execution context
# This is typically done at the module level or in a worker startup hook
# nest_asyncio.apply()

# Initalize the celery app
celery_app = Celery(
    "CoverLetterWorkflow",
    broker="amqp://guest:guest@localhost:5672//",
    backend="rpc://",
)
@celery_app.on_after_configure.connect
def setup_nest_asyncio(sender, **kwargs):
    import nest_asyncio
    nest_asyncio.apply()

# Define seperate queues
celery_app.conf.task_queues = (
    Queue("default", routing_key="task.default"),
    Queue("company-research-queue", routing_key="task.research"),
)

# Route tasks to their specific queues
celery_app.conf.task_routes = {
    "run_cover_letter_workflow": {"queue": "default", "routing_key": "task.default"},
    "run_job_research_task": {"queue": "company-research-queue", "routing_key": "task.research"},
}

def run_async(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        return loop.run_until_complete(coro)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(coro)

# Define the celery task
@celery_app.task(name="run_cover_letter_workflow")
def run_unified_workflow_task(initial_state: dict):
    """
    This Celery task takes the initial state and runs the entire
    LangGraph workflow asynchronously.
    """

    print("Starting the unified workflow task...")

    app = build_graph()

    final_state = run_async(app.ainvoke(initial_state))

    print("Workflow finished. Returning final context.")
    # Return the 'context' dictionary from the final state, 
    # which contains the generated cover letter.
    return final_state.get("context", {})

@celery_app.task(name="run_job_research_task")
def run_job_research_task(job_url: str):
    """
    [cite_start]This new task handles the company research workflow. [cite: 48]
    It will be sent to the 'company-research-queue'.
    """
    print(f"Starting company research task for URL: {job_url}")
    # [cite_start]This function comes from your company_search_agent.txt file [cite: 48]
    result = run_async(run_job_research(job_url))
    print("Company Research finished.")
    return result.model_dump() if result else None
