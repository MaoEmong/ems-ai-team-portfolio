package com.portfolio.ems;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.Optional;
interface EmployeeRepository extends JpaRepository<Employee,Long>, JpaSpecificationExecutor<Employee> {
 boolean existsByEmployeeNo(String employeeNo);
 boolean existsByEmailAndIdNot(String email, Long id);
 boolean existsByDepartmentId(Long id);
 boolean existsByPositionId(Long id);
 Optional<Employee> findByEmployeeNo(String employeeNo);
 @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select e from Employee e where e.id=:id")
 Optional<Employee> lockById(@Param("id") Long id);
}
interface AccountRepository extends JpaRepository<Account,Long> {
 @EntityGraph(attributePaths={"employee"}) Optional<Account> findByEmployeeEmployeeNo(String employeeNo);
 @EntityGraph(attributePaths={"employee"}) Optional<Account> findByEmployeeId(Long id);
}
interface DepartmentRepository extends JpaRepository<Department,Long> {
 boolean existsByNameAndIdNot(String name,Long id);
 @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select d from Department d where d.id=:id")
 Optional<Department> lockById(@Param("id") Long id);
}
interface PositionRepository extends JpaRepository<Position,Long> {
 boolean existsByNameAndIdNot(String name,Long id);
 @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select p from Position p where p.id=:id")
 Optional<Position> lockById(@Param("id") Long id);
}
