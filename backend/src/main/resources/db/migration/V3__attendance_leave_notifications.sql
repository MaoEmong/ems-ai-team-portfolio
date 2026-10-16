CREATE TABLE attendance (
 employee_id BIGINT NOT NULL, work_date DATE NOT NULL, check_in DATETIME NOT NULL, check_out DATETIME NULL,
 corrected BOOLEAN NOT NULL DEFAULT FALSE,
 PRIMARY KEY(employee_id,work_date), FOREIGN KEY(employee_id) REFERENCES employee(id)
);
CREATE TABLE leave_balance (
 employee_id BIGINT PRIMARY KEY, period_start DATE NOT NULL, period_end DATE NOT NULL,
 granted DECIMAL(5,1) NOT NULL, used DECIMAL(5,1) NOT NULL DEFAULT 0, reserved DECIMAL(5,1) NOT NULL DEFAULT 0,
 FOREIGN KEY(employee_id) REFERENCES employee(id),
 CHECK(granted>=0 AND used>=0 AND reserved>=0 AND used+reserved<=granted)
);
CREATE TABLE leave_request (
 id BIGINT AUTO_INCREMENT PRIMARY KEY, employee_id BIGINT NOT NULL,
 type VARCHAR(20) NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL,
 days DECIMAL(5,1) NOT NULL, charged DECIMAL(5,1) NOT NULL, period_start DATE NOT NULL,
 reason VARCHAR(200) NOT NULL, status VARCHAR(20) NOT NULL,
 reject_reason VARCHAR(200), decided_by BIGINT, decided_name VARCHAR(100), decided_at DATETIME,
 cancelled_by VARCHAR(10), created_at DATETIME NOT NULL,
 FOREIGN KEY(employee_id) REFERENCES employee(id), FOREIGN KEY(decided_by) REFERENCES employee(id),
 INDEX idx_leave_employee_dates(employee_id,status,start_date,end_date),
 INDEX idx_leave_created(created_at DESC,id DESC)
);
CREATE TABLE notification (
 id BIGINT AUTO_INCREMENT PRIMARY KEY, recipient_id BIGINT NOT NULL,
 type VARCHAR(40) NOT NULL, target_type VARCHAR(20) NOT NULL, target_id BIGINT, target_date DATE,
 message VARCHAR(200) NOT NULL, is_read BOOLEAN NOT NULL DEFAULT FALSE, created_at DATETIME NOT NULL,
 FOREIGN KEY(recipient_id) REFERENCES employee(id),
 INDEX idx_notification_recipient(recipient_id,is_read,created_at DESC,id DESC)
);
CREATE TABLE demo_seed_marker (
 id INT PRIMARY KEY, seeded_at DATETIME NOT NULL
);
