ALTER TABLE department ADD parent_id BIGINT NULL, ADD CONSTRAINT fk_department_parent FOREIGN KEY(parent_id) REFERENCES department(id);
CREATE TABLE organization_lock (id INT PRIMARY KEY);
INSERT INTO organization_lock(id) VALUES(1);
CREATE TABLE job_title(id BIGINT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(100) NOT NULL,description VARCHAR(500),CONSTRAINT uk_job_title_name UNIQUE(name));
ALTER TABLE employee ADD job_title_id BIGINT NULL, ADD CONSTRAINT fk_employee_job_title FOREIGN KEY(job_title_id) REFERENCES job_title(id);
ALTER TABLE appointment
 ADD from_job_title_id BIGINT NULL, ADD from_job_title_name VARCHAR(100) NULL,
 ADD to_job_title_id BIGINT NULL, ADD to_job_title_name VARCHAR(100) NULL,
 ADD CONSTRAINT fk_appointment_from_job_title FOREIGN KEY(from_job_title_id) REFERENCES job_title(id),
 ADD CONSTRAINT fk_appointment_to_job_title FOREIGN KEY(to_job_title_id) REFERENCES job_title(id);
CREATE TABLE salary_setting(employee_id BIGINT PRIMARY KEY,base_salary BIGINT NOT NULL,allowance BIGINT NOT NULL,formula_version VARCHAR(30) NOT NULL,rate1 INT NOT NULL,rate2 INT NOT NULL,rate3 INT NOT NULL,
 FOREIGN KEY(employee_id) REFERENCES employee(id),CHECK(base_salary BETWEEN 0 AND 1000000000 AND allowance BETWEEN 0 AND 1000000000));
CREATE TABLE payroll_month(id BIGINT AUTO_INCREMENT PRIMARY KEY,pay_month CHAR(7) NOT NULL,status VARCHAR(20) NOT NULL,
 generated_at DATETIME NOT NULL,generated_by JSON NOT NULL,confirmed_at DATETIME NULL,confirmed_by JSON NULL,
 UNIQUE(pay_month));
CREATE TABLE payslip(id BIGINT AUTO_INCREMENT PRIMARY KEY,payroll_id BIGINT NOT NULL,employee_id BIGINT NOT NULL,employee_no VARCHAR(50) NOT NULL,snapshot_json JSON NOT NULL,
 FOREIGN KEY(payroll_id) REFERENCES payroll_month(id),FOREIGN KEY(employee_id) REFERENCES employee(id),UNIQUE(payroll_id,employee_id));
CREATE TABLE evaluation_cycle(id BIGINT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(100) NOT NULL,start_date DATE NOT NULL,end_date DATE NOT NULL,status VARCHAR(20) NOT NULL);
CREATE TABLE evaluation_item(id BIGINT AUTO_INCREMENT PRIMARY KEY,cycle_id BIGINT NOT NULL,name VARCHAR(100) NOT NULL,sort_order INT NOT NULL,
 FOREIGN KEY(cycle_id) REFERENCES evaluation_cycle(id));
CREATE TABLE evaluation_assignment(id BIGINT AUTO_INCREMENT PRIMARY KEY,cycle_id BIGINT NOT NULL,employee_id BIGINT NOT NULL,reviewer_id BIGINT NOT NULL,
 FOREIGN KEY(cycle_id) REFERENCES evaluation_cycle(id),FOREIGN KEY(employee_id) REFERENCES employee(id),FOREIGN KEY(reviewer_id) REFERENCES employee(id),UNIQUE(cycle_id,employee_id));
CREATE TABLE evaluation_form(id BIGINT AUTO_INCREMENT PRIMARY KEY,cycle_id BIGINT NOT NULL,employee_id BIGINT NOT NULL,reviewer_id BIGINT NOT NULL,
 state VARCHAR(30) NOT NULL,items_json JSON NOT NULL,self_answers_json JSON NOT NULL,manager_answers_json JSON NOT NULL,final_score DECIMAL(3,2) NULL,grade VARCHAR(1) NULL,
 FOREIGN KEY(cycle_id) REFERENCES evaluation_cycle(id),FOREIGN KEY(employee_id) REFERENCES employee(id),FOREIGN KEY(reviewer_id) REFERENCES employee(id),UNIQUE(cycle_id,employee_id));
