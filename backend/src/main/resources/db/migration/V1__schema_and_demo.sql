CREATE TABLE department (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(100) NOT NULL, description VARCHAR(500),
 CONSTRAINT uk_department_name UNIQUE(name)
);
CREATE TABLE job_position (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(100) NOT NULL, level INT NOT NULL,
 CONSTRAINT uk_position_name UNIQUE(name)
);
CREATE TABLE employee (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 employee_no VARCHAR(50) NOT NULL, name VARCHAR(100) NOT NULL,
 email VARCHAR(254) NOT NULL, phone VARCHAR(30),
 hire_date DATE NOT NULL, status VARCHAR(20) NOT NULL, retire_date DATE,
 department_id BIGINT NOT NULL, position_id BIGINT NOT NULL,
 CONSTRAINT uk_employee_no UNIQUE(employee_no),
 CONSTRAINT uk_employee_email UNIQUE(email),
 CONSTRAINT fk_employee_department FOREIGN KEY(department_id) REFERENCES department(id),
 CONSTRAINT fk_employee_position FOREIGN KEY(position_id) REFERENCES job_position(id),
 CONSTRAINT ck_employee_status CHECK(status IN ('ACTIVE','ON_LEAVE','RETIRED')),
 CONSTRAINT ck_retire_date CHECK((status='RETIRED' AND retire_date IS NOT NULL AND retire_date>=hire_date) OR (status<>'RETIRED' AND retire_date IS NULL)),
 INDEX idx_employee_hire_date(hire_date), INDEX idx_employee_name(name), INDEX idx_employee_status(status)
);
CREATE TABLE user_account (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 employee_id BIGINT NOT NULL UNIQUE, password_hash VARCHAR(100) NOT NULL,
 role VARCHAR(20) NOT NULL, enabled BOOLEAN NOT NULL,
 CONSTRAINT fk_account_employee FOREIGN KEY(employee_id) REFERENCES employee(id),
 CONSTRAINT ck_account_role CHECK(role IN ('ADMIN','EMPLOYEE'))
);
INSERT INTO department(name,description) VALUES
 ('가상개발부','합성 데모 부서'),('가상운영부','합성 데모 부서'),('가상인사부','합성 데모 부서');
INSERT INTO job_position(name,level) VALUES ('가상사원',1),('가상대리',2),('가상과장',3);
