CREATE TABLE appointment (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 employee_id BIGINT NOT NULL,
 effective_date DATE NOT NULL,
 from_department_id BIGINT NOT NULL, from_department_name VARCHAR(100) NOT NULL,
 to_department_id BIGINT NOT NULL, to_department_name VARCHAR(100) NOT NULL,
 from_position_id BIGINT NOT NULL, from_position_name VARCHAR(100) NOT NULL, from_position_level INT NOT NULL,
 to_position_id BIGINT NOT NULL, to_position_name VARCHAR(100) NOT NULL, to_position_level INT NOT NULL,
 reason VARCHAR(200) NOT NULL,
 created_by_id BIGINT NOT NULL, created_by_name VARCHAR(100) NOT NULL,
 created_at DATETIME(6) NOT NULL,
 CONSTRAINT fk_appointment_employee FOREIGN KEY(employee_id) REFERENCES employee(id),
 CONSTRAINT fk_appointment_from_department FOREIGN KEY(from_department_id) REFERENCES department(id),
 CONSTRAINT fk_appointment_to_department FOREIGN KEY(to_department_id) REFERENCES department(id),
 CONSTRAINT fk_appointment_from_position FOREIGN KEY(from_position_id) REFERENCES job_position(id),
 CONSTRAINT fk_appointment_to_position FOREIGN KEY(to_position_id) REFERENCES job_position(id),
 CONSTRAINT fk_appointment_creator FOREIGN KEY(created_by_id) REFERENCES employee(id),
 INDEX idx_appointment_employee_date(employee_id,effective_date DESC,id DESC)
);
CREATE TABLE audit_log (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 occurred_at DATETIME(6) NOT NULL,
 actor_id BIGINT NULL, actor_snapshot JSON NULL,
 action VARCHAR(40) NOT NULL, target_type VARCHAR(20) NULL,
 target_id BIGINT NULL, target_label VARCHAR(100) NULL,
 success BOOLEAN NOT NULL,
 before_json JSON NULL, after_json JSON NULL, metadata_json JSON NOT NULL,
 INDEX idx_audit_time(occurred_at DESC,id DESC),
 INDEX idx_audit_actor_time(actor_id,occurred_at DESC,id DESC),
 INDEX idx_audit_target_time(target_type,target_id,occurred_at DESC,id DESC),
 INDEX idx_audit_action_time(action,occurred_at DESC,id DESC),
 INDEX idx_audit_success_time(success,occurred_at DESC,id DESC)
);
