package com.portfolio.ems;
import jakarta.persistence.*;
import java.time.LocalDate;
enum Role { ADMIN, EMPLOYEE }
enum EmployeeStatus { ACTIVE, ON_LEAVE, RETIRED }
@Entity @Table(name="department")
class Department {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) Long id;
 @Column(nullable=false,unique=true,length=100) String name;
 @Column(length=500) String description;
 @ManyToOne @JoinColumn(name="parent_id") Department parent;
}
@Entity @Table(name="job_position")
class Position {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) Long id;
 @Column(nullable=false,unique=true,length=100) String name;
 @Column(nullable=false) Integer level;
}
@Entity @Table(name="employee")
class Employee {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) Long id;
 @Column(name="employee_no",nullable=false,unique=true,length=50) String employeeNo;
 @Column(nullable=false,length=100) String name;
 @Column(nullable=false,unique=true,length=254) String email;
 @Column(length=30) String phone;
 @Column(nullable=false) LocalDate hireDate;
 @Enumerated(EnumType.STRING) @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.VARCHAR)
 @Column(nullable=false,length=20) EmployeeStatus status;
 LocalDate retireDate;
 @ManyToOne(optional=false) @JoinColumn(name="department_id") Department department;
 @ManyToOne(optional=false) @JoinColumn(name="position_id") Position position;
 @ManyToOne @JoinColumn(name="job_title_id") JobTitle jobTitle;
 @OneToOne(mappedBy="employee",cascade=CascadeType.ALL,optional=false) Account account;
}
@Entity @Table(name="job_title")
class JobTitle {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) Long id;
 @Column(nullable=false,unique=true,length=100) String name;
 @Column(length=500) String description;
}
@Entity @Table(name="user_account")
class Account {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) Long id;
 @OneToOne(optional=false) @JoinColumn(name="employee_id",unique=true) Employee employee;
 @Column(nullable=false,length=100) String passwordHash;
 @Enumerated(EnumType.STRING) @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.VARCHAR)
 @Column(nullable=false,length=20) Role role;
 @Column(nullable=false) boolean enabled;
}
