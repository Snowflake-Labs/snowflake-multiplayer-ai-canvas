-- =============================================================================
-- Agent Canvas — Snowflake setup
-- =============================================================================
-- Run this once in your Snowflake account to create every object the app
-- needs. Run as ACCOUNTADMIN or a role with equivalent privileges.
--
-- Creates:
--   AGENT_CANVAS_ROLE          Least-privilege execution role for the app
--   AGENT_CANVAS_WH            XS warehouse for Analyst queries
--   AGENT_CANVAS                Database with two schemas:
--     PUBLIC.CANVASES            Thread-ID mapping table (app plumbing)
--     AGENTS.TPCH_REV_SV         Semantic view over TPC-H sample data
--     AGENTS.CANVAS_AGENT        Cortex Agent with five tools
--   SNOWFLAKE_DOCUMENTATION    Installed from Marketplace listing GZSTZ67BY9OQ4
--
-- After this runs:
--   snow app deploy
-- =============================================================================

USE ROLE ACCOUNTADMIN;

-- -----------------------------------------------------------------------------
-- 1. Role, warehouse, database, schemas
-- -----------------------------------------------------------------------------
CREATE ROLE IF NOT EXISTS AGENT_CANVAS_ROLE
  COMMENT = 'Least-privilege execution role for the Agent Canvas app';

CREATE WAREHOUSE IF NOT EXISTS AGENT_CANVAS_WH
  WAREHOUSE_SIZE = XSMALL
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE
  INITIALLY_SUSPENDED = TRUE
  COMMENT = 'Warehouse for Agent Canvas Analyst queries';

CREATE DATABASE IF NOT EXISTS AGENT_CANVAS
  COMMENT = 'Agent Canvas app database';
USE DATABASE AGENT_CANVAS;

CREATE SCHEMA IF NOT EXISTS AGENTS
  COMMENT = 'Cortex Agent and semantic view';
CREATE SCHEMA IF NOT EXISTS PUBLIC
  COMMENT = 'App plumbing — canvas-to-thread mapping';

-- -----------------------------------------------------------------------------
-- 2. CANVASES table (maps a canvas ID to the Cortex Agent thread ID)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS AGENT_CANVAS.PUBLIC.CANVASES (
  canvas_id     VARCHAR    NOT NULL,
  thread_id     NUMBER     NOT NULL,
  display_name  VARCHAR,
  created_by    VARCHAR    NOT NULL,
  created_at    TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  CONSTRAINT pk_canvases PRIMARY KEY (canvas_id)
);

-- Durable, append-only log of context captured via /file in the canvas UI.
-- One row per filing event. See src/app/api/canvas/[id]/file/route.ts for the
-- write path and src/components/FilingCard.tsx for how filings render.
CREATE TABLE IF NOT EXISTS AGENT_CANVAS.PUBLIC.CANVAS_CONTEXT (
  id            VARCHAR       NOT NULL,     -- filing uuid (one row per filing)
  canvas_id     VARCHAR       NOT NULL,     -- links to CANVASES.canvas_id
  thread_id     NUMBER,                     -- Cortex thread ID at filing time (nullable)
  filed_by      VARCHAR       NOT NULL,     -- user who ran /file
  participants  ARRAY,                      -- usernames present when filed
  source        VARCHAR       NOT NULL,     -- 'user' | 'agent'
  context       VARCHAR       NOT NULL,     -- the filed text
  filed_at      TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  CONSTRAINT pk_canvas_context PRIMARY KEY (id)
);

-- -----------------------------------------------------------------------------
-- 3. Install the Snowflake Documentation CKE
-- -----------------------------------------------------------------------------
-- Free Cortex Knowledge Extension published by Snowflake. If you already have
-- the SNOWFLAKE_DOCUMENTATION database installed, this block is a no-op.
-- Run as a human user (TYPE=PERSON); SERVICE users can't request listings.
-- -----------------------------------------------------------------------------
CALL SYSTEM$REQUEST_LISTING_AND_WAIT('GZSTZ67BY9OQ4');
CREATE DATABASE IF NOT EXISTS SNOWFLAKE_DOCUMENTATION
  FROM LISTING 'GZSTZ67BY9OQ4';

-- -----------------------------------------------------------------------------
-- 4. Semantic view over TPC-H sample data
-- -----------------------------------------------------------------------------
-- SNOWFLAKE_SAMPLE_DATA.TPCH_SF1 is auto-provisioned in every Snowflake
-- account. This semantic view wraps CUSTOMER, ORDERS, LINEITEM, NATION, and
-- REGION with named dimensions and metrics so Cortex Analyst can route
-- natural-language questions into deterministic SQL.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE SEMANTIC VIEW AGENT_CANVAS.AGENTS.TPCH_REV_SV

  TABLES (
    customers AS SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.CUSTOMER
      PRIMARY KEY (c_custkey)
      WITH SYNONYMS ('customer', 'client', 'buyer')
      COMMENT = 'Customer master; one row per customer',
    orders AS SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.ORDERS
      PRIMARY KEY (o_orderkey)
      WITH SYNONYMS ('sales order', 'purchase order')
      COMMENT = 'Order header; one row per order',
    line_items AS SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.LINEITEM
      PRIMARY KEY (l_orderkey, l_linenumber)
      WITH SYNONYMS ('order line', 'order item')
      COMMENT = 'Order line items; one row per line in an order',
    nations AS SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.NATION
      PRIMARY KEY (n_nationkey)
      COMMENT = 'Country reference',
    regions AS SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.REGION
      PRIMARY KEY (r_regionkey)
      COMMENT = 'Geographic region reference'
  )

  RELATIONSHIPS (
    orders_to_customers AS
      orders (o_custkey) REFERENCES customers,
    line_items_to_orders AS
      line_items (l_orderkey) REFERENCES orders,
    customers_to_nations AS
      customers (c_nationkey) REFERENCES nations,
    nations_to_regions AS
      nations (n_regionkey) REFERENCES regions
  )

  FACTS (
    line_items.extended_price AS l_extendedprice
      COMMENT = 'Extended price (quantity * unit price) before discount',
    line_items.discounted_price AS l_extendedprice * (1 - l_discount)
      COMMENT = 'Price after discount but before tax',
    line_items.quantity AS l_quantity
      COMMENT = 'Units shipped on this line'
  )

  DIMENSIONS (
    nations.nation_name AS nations.n_name
      WITH SYNONYMS = ('country', 'country name')
      COMMENT = 'Name of the customer''s country',
    regions.region_name AS regions.r_name
      WITH SYNONYMS = ('continent', 'region')
      COMMENT = 'Geographic region (AFRICA, AMERICA, ASIA, EUROPE, MIDDLE EAST)',
    customers.market_segment AS customers.c_mktsegment
      WITH SYNONYMS = ('segment', 'market')
      COMMENT = 'Market segment (AUTOMOBILE, BUILDING, FURNITURE, HOUSEHOLD, MACHINERY)',
    orders.order_date AS orders.o_orderdate
      COMMENT = 'Date the order was placed',
    orders.order_year AS YEAR(orders.o_orderdate)
      COMMENT = 'Year the order was placed',
    orders.order_month AS DATE_TRUNC('month', orders.o_orderdate)
      COMMENT = 'Month the order was placed (truncated to month start)',
    orders.order_status AS orders.o_orderstatus
      COMMENT = 'Order status (F = fulfilled, O = open, P = partial)',
    line_items.ship_mode AS line_items.l_shipmode
      COMMENT = 'Shipping method (AIR, RAIL, SHIP, TRUCK, MAIL, FOB, REG AIR)'
  )

  METRICS (
    line_items.total_revenue AS SUM(line_items.discounted_price)
      COMMENT = 'Total discounted revenue across all line items',
    line_items.total_quantity AS SUM(line_items.quantity)
      COMMENT = 'Total units shipped',
    orders.order_count AS COUNT(DISTINCT orders.o_orderkey)
      COMMENT = 'Count of distinct orders',
    customers.customer_count AS COUNT(DISTINCT customers.c_custkey)
      COMMENT = 'Count of distinct customers',
    line_items.line_item_count AS COUNT(*)
      COMMENT = 'Count of line items',
    orders.avg_order_value AS AVG(orders.o_totalprice)
      COMMENT = 'Average total order price'
  )

  COMMENT = 'TPC-H revenue analysis — the stock semantic view that ships with the Agent Canvas demo. Swap in your own view to point the agent at your data.'

  AI_VERIFIED_QUERIES (
    revenue_by_region AS (
      QUESTION 'What is the total revenue by region?'
      SQL 'SELECT * FROM SEMANTIC_VIEW(AGENT_CANVAS.AGENTS.TPCH_REV_SV METRICS line_items.total_revenue DIMENSIONS regions.region_name) ORDER BY total_revenue DESC'
    ),
    revenue_by_year AS (
      QUESTION 'What is total revenue per year?'
      SQL 'SELECT * FROM SEMANTIC_VIEW(AGENT_CANVAS.AGENTS.TPCH_REV_SV METRICS line_items.total_revenue DIMENSIONS orders.order_year) ORDER BY order_year'
    ),
    top_segments_by_revenue AS (
      QUESTION 'Which market segment has the highest revenue?'
      SQL 'SELECT * FROM SEMANTIC_VIEW(AGENT_CANVAS.AGENTS.TPCH_REV_SV METRICS line_items.total_revenue DIMENSIONS customers.market_segment) ORDER BY total_revenue DESC'
    )
  );

-- -----------------------------------------------------------------------------
-- 4b. GET_FILINGS UDF — the agent's read tool over CANVAS_CONTEXT
-- -----------------------------------------------------------------------------
-- Returns a JSON array of filing records for a given canvas, newest first.
-- Called by the agent via a `generic` tool when a user asks about saved
-- context, prior decisions, or the history of the room.
CREATE OR REPLACE FUNCTION AGENT_CANVAS.AGENTS.GET_FILINGS(canvas_id STRING)
RETURNS ARRAY
AS
$$
  SELECT ARRAY_AGG(OBJECT_CONSTRUCT(
    'id', id,
    'filed_by', filed_by,
    'source', source,
    'participants', participants,
    'context', context,
    'filed_at', filed_at
  )) WITHIN GROUP (ORDER BY filed_at DESC)
  FROM AGENT_CANVAS.PUBLIC.CANVAS_CONTEXT c
  WHERE c.canvas_id = canvas_id
$$;

-- -----------------------------------------------------------------------------
-- 5. Cortex Agent
-- -----------------------------------------------------------------------------
CREATE OR REPLACE AGENT AGENT_CANVAS.AGENTS.CANVAS_AGENT
  COMMENT = 'Agent Canvas demo agent — routes TPC-H revenue questions to Analyst, Snowflake documentation questions to Search, visualizes with Data to Chart, and uses web search for context.'
  PROFILE = '{"display_name": "Gil", "color": "blue"}'
  FROM SPECIFICATION
  $$
  models:
    orchestration: auto

  orchestration:
    tool_not_accessible: accept
    budget:
      seconds: 60
      tokens: 32000

  instructions:
    response: "You are Gil, an agent inside a shared chat canvas. Multiple humans are in the room with you. Answer concisely. When a human asks a data question, use the TPC-H analyst tool. When a human asks about Snowflake features, use the docs search tool. Visualize numeric results with the data_to_chart tool when a chart would help. Use web search only for current events or topics not covered by the other tools. Do not offer to save things as personal skills, memory, or external storage — this canvas only has what the available tools provide."
    orchestration: "The first line of every user message is `[canvas: <id>]` — treat that id as the current canvas and pass it to any tool that needs a canvas identifier. For revenue, order, customer, nation, region, or market segment questions, use tpch_analyst. For Snowflake documentation, SQL syntax, feature behavior, or best practices, use docs_search. For questions about what has been filed in this room, prior decisions, saved context, or the history of this canvas, call get_filings with the current canvas id. Call data_to_chart after tpch_analyst when the result is numeric and would benefit from a visualization. Use web_search only as a last resort for topics not covered by the other tools."
    sample_questions:
      - question: "What is the total revenue by region?"
      - question: "How do I create a Snowpipe?"
      - question: "What context have we filed in this canvas?"

  tools:
    - tool_spec:
        type: "cortex_analyst_text_to_sql"
        name: "tpch_analyst"
        description: "Converts natural language questions about TPC-H revenue, orders, customers, nations, regions, and market segments into SQL via the TPCH_REV_SV semantic view."
    - tool_spec:
        type: "cortex_search"
        name: "docs_search"
        description: "Searches the official Snowflake documentation for SQL syntax, feature behavior, and best practices."
    - tool_spec:
        type: "data_to_chart"
        name: "data_to_chart"
        description: "Generates a Vega-Lite chart specification from numeric results returned by tpch_analyst."
    - tool_spec:
        type: "web_search"
        name: "web_search"
        description: "Searches the web for topics not covered by the TPC-H semantic view or Snowflake documentation."
    - tool_spec:
        type: "generic"
        name: "get_filings"
        description: "Retrieve filed context from this canvas — notes, decisions, learnings, and open threads that participants captured via /file during this session or any prior session on the same canvas. Call this whenever the user asks what has been filed, what the team decided, what notes exist, or anything about the saved history of this room."
        input_schema:
          type: "object"
          properties:
            canvas_id:
              type: "string"
              description: "The canvas id to retrieve filings for. Pass the value from the [canvas: ...] prefix on the user's message."
          required: ["canvas_id"]

  tool_resources:
    tpch_analyst:
      semantic_view: "AGENT_CANVAS.AGENTS.TPCH_REV_SV"
      execution_environment:
        type: "warehouse"
        warehouse: "AGENT_CANVAS_WH"
    docs_search:
      search_service: "SNOWFLAKE_DOCUMENTATION.SHARED.CKE_SNOWFLAKE_DOCS_SERVICE"
      max_results: "5"
      id_column: "SOURCE_URL"
    get_filings:
      identifier: "AGENT_CANVAS.AGENTS.GET_FILINGS"
      type: "function"
      execution_environment:
        type: "warehouse"
        warehouse: "AGENT_CANVAS_WH"
  $$;

-- -----------------------------------------------------------------------------
-- 6. Grants on AGENT_CANVAS_ROLE
-- -----------------------------------------------------------------------------
GRANT USAGE ON DATABASE AGENT_CANVAS TO ROLE AGENT_CANVAS_ROLE;
GRANT USAGE ON SCHEMA AGENT_CANVAS.AGENTS TO ROLE AGENT_CANVAS_ROLE;
GRANT USAGE ON SCHEMA AGENT_CANVAS.PUBLIC TO ROLE AGENT_CANVAS_ROLE;

GRANT USAGE ON WAREHOUSE AGENT_CANVAS_WH TO ROLE AGENT_CANVAS_ROLE;

GRANT USAGE ON AGENT AGENT_CANVAS.AGENTS.CANVAS_AGENT TO ROLE AGENT_CANVAS_ROLE;
GRANT SELECT, REFERENCES ON SEMANTIC VIEW AGENT_CANVAS.AGENTS.TPCH_REV_SV TO ROLE AGENT_CANVAS_ROLE;
GRANT USAGE ON FUNCTION AGENT_CANVAS.AGENTS.GET_FILINGS(STRING) TO ROLE AGENT_CANVAS_ROLE;

-- TPC-H sample data (read-only, inbound share)
GRANT IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE_SAMPLE_DATA TO ROLE AGENT_CANVAS_ROLE;

-- Snowflake Documentation CKE (read-only, inbound share)
GRANT IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE_DOCUMENTATION TO ROLE AGENT_CANVAS_ROLE;

-- CANVASES table (read-write — the app writes thread IDs here)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE AGENT_CANVAS.PUBLIC.CANVASES
  TO ROLE AGENT_CANVAS_ROLE;

-- CANVAS_CONTEXT table (append-only — the app writes /file submissions here)
GRANT SELECT, INSERT ON TABLE AGENT_CANVAS.PUBLIC.CANVAS_CONTEXT
  TO ROLE AGENT_CANVAS_ROLE;

-- Grant AGENT_CANVAS_ROLE to ACCOUNTADMIN so the SPCS service's inherited
-- role chain can downgrade to it via the X-Snowflake-Role header.
GRANT ROLE AGENT_CANVAS_ROLE TO ROLE ACCOUNTADMIN;

-- -----------------------------------------------------------------------------
-- 7. Sanity checks (optional — uncomment to verify)
-- -----------------------------------------------------------------------------
-- SHOW DATABASES LIKE 'AGENT_CANVAS';
-- SHOW DATABASES LIKE 'SNOWFLAKE_DOCUMENTATION';
-- SHOW WAREHOUSES LIKE 'AGENT_CANVAS_WH';
-- SHOW ROLES LIKE 'AGENT_CANVAS_ROLE';
-- SHOW SEMANTIC VIEWS IN SCHEMA AGENT_CANVAS.AGENTS;
-- SHOW AGENTS IN SCHEMA AGENT_CANVAS.AGENTS;
-- SELECT COUNT(*) FROM AGENT_CANVAS.PUBLIC.CANVASES;
--
-- SELECT * FROM SEMANTIC_VIEW(
--   AGENT_CANVAS.AGENTS.TPCH_REV_SV
--   METRICS line_items.total_revenue
--   DIMENSIONS regions.region_name
-- ) ORDER BY total_revenue DESC;

-- =============================================================================
-- Setup complete. Next:
--   snow app deploy
-- =============================================================================
