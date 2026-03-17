-- ─────────────────────────────────────────────────────────────
-- Qiyas Migration v1.0
-- Run ONCE against your existing database.
-- Creates 2 new tables — does NOT touch any existing tables.
-- ─────────────────────────────────────────────────────────────

-- QA Scores table
CREATE TABLE IF NOT EXISTS qiyas_qa_scores (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    request_id          INT NOT NULL UNIQUE,
    
    -- Dimension scores
    score_greeting      FLOAT NOT NULL DEFAULT 0,
    score_discovery     FLOAT NOT NULL DEFAULT 0,
    score_verification  FLOAT NOT NULL DEFAULT 0,
    score_resolution    FLOAT NOT NULL DEFAULT 0,
    score_next_steps    FLOAT NOT NULL DEFAULT 0,
    score_efficiency    FLOAT NOT NULL DEFAULT 0,
    score_escalation    FLOAT NOT NULL DEFAULT 0,
    score_compliance    FLOAT NOT NULL DEFAULT 0,
    
    -- Total
    total_score         FLOAT NOT NULL,
    
    -- AI analysis
    summary_ar          TEXT,
    summary_en          TEXT,
    action_required     TEXT,
    raw_llm_response    TEXT,
    
    -- Flags
    is_flagged          TINYINT(1) NOT NULL DEFAULT 0,
    is_repeat_contact   TINYINT(1) NOT NULL DEFAULT 0,
    repeat_contact_count INT NOT NULL DEFAULT 1,
    
    -- Dispute
    is_disputed         TINYINT(1) NOT NULL DEFAULT 0,
    dispute_reason      TEXT,
    dispute_by_user_id  INT,
    dispute_at          DATETIME,
    
    -- Metadata
    scored_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    model_used          VARCHAR(100),
    scoring_version     VARCHAR(20) NOT NULL DEFAULT '1.0',
    
    -- Foreign key to existing table
    CONSTRAINT fk_qa_request FOREIGN KEY (request_id)
        REFERENCES base_requests(id) ON DELETE CASCADE,
    
    INDEX idx_total_score  (total_score),
    INDEX idx_is_flagged   (is_flagged),
    INDEX idx_scored_at    (scored_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Alerts table
CREATE TABLE IF NOT EXISTS qiyas_alerts (
    id                      INT AUTO_INCREMENT PRIMARY KEY,
    qa_score_id             INT,
    request_id              INT,
    alert_type              ENUM('low_score','repeat_contact','app_downtime') NOT NULL,
    status                  ENUM('open','reviewed','dismissed') NOT NULL DEFAULT 'open',
    message                 TEXT,
    score                   FLOAT,
    notify_supervisor_id    INT,
    notify_manager_id       INT,
    email_sent              TINYINT(1) NOT NULL DEFAULT 0,
    email_sent_at           DATETIME,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at             DATETIME,
    reviewed_by_id          INT,
    
    CONSTRAINT fk_alert_qa  FOREIGN KEY (qa_score_id)
        REFERENCES qiyas_qa_scores(id) ON DELETE SET NULL,
    CONSTRAINT fk_alert_req FOREIGN KEY (request_id)
        REFERENCES base_requests(id) ON DELETE SET NULL,
    
    INDEX idx_alert_status  (status),
    INDEX idx_alert_type    (alert_type),
    INDEX idx_alert_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
